export class NotionService {
  constructor(private readonly token = process.env.NOTION_TOKEN) {}

  async createUser(_payload: unknown): Promise<void> {
    if (!this.token) {
      throw new Error("NOTION_TOKEN is not configured");
    }
  }

  async createMovement(_payload: unknown): Promise<void> {
    if (!this.token) {
      throw new Error("NOTION_TOKEN is not configured");
    }
  }
}
