export type DashboardApiRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type DashboardApiResponse = {
  status: (statusCode: number) => DashboardApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
};
