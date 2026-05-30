import { Client, type UpdateDataSourceParameters } from "@notionhq/client";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

type RequiredProperty = {
  type: "select" | "rich_text" | "number";
  options?: string[];
};

type ExistingProperty = {
  type?: unknown;
  select?: {
    options?: Array<{
      id?: unknown;
      name?: unknown;
    }>;
  };
};

type DataSourceSchema = {
  properties?: Record<string, ExistingProperty>;
};

type DatabaseSchema = {
  data_sources?: Array<{
    id?: unknown;
    name?: unknown;
  }>;
};

type UpdateProperties = NonNullable<UpdateDataSourceParameters["properties"]>;

const REQUIRED_PROPERTIES: Record<string, RequiredProperty> = {
  Usuário: {
    type: "select",
    options: ["Ariane", "Alex"],
  },
  Categoria: {
    type: "select",
    options: [
      "Pets",
      "Dívidas / Limpar Nome",
      "Empréstimo",
      "Consórcio / Financiamento",
    ],
  },
  Parcela: {
    type: "rich_text",
  },
  "Parcela Atual": {
    type: "number",
  },
  "Total de Parcelas": {
    type: "number",
  },
  "Grupo/Contrato": {
    type: "rich_text",
  },
  "Telegram User ID": {
    type: "rich_text",
  },
  Origem: {
    type: "select",
  },
  Status: {
    type: "select",
    options: ["Registrado"],
  },
};

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} não configurado.`);
  }

  return value;
}

function getDataSourceReferences(database: DatabaseSchema): Array<{
  id: string;
  name: string;
}> {
  return (database.data_sources ?? []).flatMap((dataSource) =>
    typeof dataSource.id === "string"
      ? [
          {
            id: dataSource.id,
            name:
              typeof dataSource.name === "string"
                ? dataSource.name
                : "sem nome",
          },
        ]
      : [],
  );
}

function resolveDataSourceId(database: DatabaseSchema): string {
  const configuredDataSourceId =
    process.env.NOTION_MOVEMENTS_DATA_SOURCE_ID?.trim();
  const references = getDataSourceReferences(database);

  if (configuredDataSourceId) {
    if (
      references.length > 0 &&
      !references.some((reference) => reference.id === configuredDataSourceId)
    ) {
      throw new Error(
        "NOTION_MOVEMENTS_DATA_SOURCE_ID não pertence à database configurada.",
      );
    }

    return configuredDataSourceId;
  }

  if (references.length === 1) {
    return references[0]!.id;
  }

  if (references.length === 0) {
    throw new Error(
      "Nenhum data source encontrado na database de movimentações.",
    );
  }

  const availableDataSources = references
    .map((reference) => `${reference.name} (${reference.id})`)
    .join(", ");

  throw new Error(
    `A database possui mais de um data source. Configure NOTION_MOVEMENTS_DATA_SOURCE_ID com um destes IDs: ${availableDataSources}`,
  );
}

function buildNewProperty(property: RequiredProperty): UpdateProperties[string] {
  if (property.type === "select") {
    return {
      select: {
        options: property.options?.map((name) => ({ name })) ?? [],
      },
    };
  }

  if (property.type === "number") {
    return {
      number: {
        format: "number",
      },
    };
  }

  return {
    rich_text: {},
  };
}

function getSelectOptions(
  propertyName: string,
  property: ExistingProperty,
): Array<{ id: string; name: string }> {
  return (property.select?.options ?? []).map((option) => {
    if (typeof option.id !== "string" || typeof option.name !== "string") {
      throw new Error(
        `Não foi possível ler as opções existentes de "${propertyName}".`,
      );
    }

    return {
      id: option.id,
      name: option.name,
    };
  });
}

function buildSchemaUpdate(
  existingProperties: Record<string, ExistingProperty>,
): UpdateProperties {
  const updates: UpdateProperties = {};
  const conflicts: string[] = [];

  for (const [name, requiredProperty] of Object.entries(REQUIRED_PROPERTIES)) {
    const existingProperty = existingProperties[name];

    if (!existingProperty) {
      updates[name] = buildNewProperty(requiredProperty);
      console.log(`[criar] ${name} (${requiredProperty.type})`);
      continue;
    }

    if (existingProperty.type !== requiredProperty.type) {
      conflicts.push(
        `"${name}" existe como ${String(existingProperty.type)}, mas deveria ser ${requiredProperty.type}`,
      );
      continue;
    }

    if (requiredProperty.type !== "select") {
      console.log(`[ok] ${name} (${requiredProperty.type})`);
      continue;
    }

    const existingOptions = getSelectOptions(name, existingProperty);
    const existingOptionNames = new Set(
      existingOptions.map((option) => option.name),
    );
    const missingOptions = (requiredProperty.options ?? []).filter(
      (option) => !existingOptionNames.has(option),
    );

    if (missingOptions.length === 0) {
      console.log(`[ok] ${name} (select)`);
      continue;
    }

    updates[name] = {
      select: {
        options: [
          ...existingOptions.map((option) => ({ id: option.id })),
          ...missingOptions.map((option) => ({ name: option })),
        ],
      },
    };

    console.log(`[adicionar opções] ${name}: ${missingOptions.join(", ")}`);
  }

  if (conflicts.length > 0) {
    throw new Error(
      `Conflitos de tipo encontrados. Nenhuma alteração foi aplicada:\n- ${conflicts.join("\n- ")}`,
    );
  }

  return updates;
}

async function main(): Promise<void> {
  const token = requireEnvironmentVariable("NOTION_TOKEN");
  const databaseId = requireEnvironmentVariable(
    "NOTION_MOVEMENTS_DATABASE_ID",
  );
  const dryRun = process.argv.includes("--dry-run");
  const notion = new Client({ auth: token });

  console.log(
    dryRun
      ? "Sincronização do schema do Notion: simulação."
      : "Sincronização do schema do Notion: aplicação.",
  );

  const database = (await notion.databases.retrieve({
    database_id: databaseId,
  })) as DatabaseSchema;
  const dataSourceId = resolveDataSourceId(database);
  const dataSource = (await notion.dataSources.retrieve({
    data_source_id: dataSourceId,
  })) as DataSourceSchema;
  const updates = buildSchemaUpdate(dataSource.properties ?? {});

  if (Object.keys(updates).length === 0) {
    console.log("Schema já está atualizado. Nenhuma alteração necessária.");
    return;
  }

  if (dryRun) {
    console.log("Simulação concluída. Nenhuma alteração foi aplicada.");
    return;
  }

  await notion.dataSources.update({
    data_source_id: dataSourceId,
    properties: updates,
  });

  console.log("Schema atualizado com sucesso.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`Falha ao sincronizar schema do Notion: ${message}`);
  process.exitCode = 1;
});
