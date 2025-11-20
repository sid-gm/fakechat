export interface VercelRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  on(event: string, callback: (...args: unknown[]) => void): void;
}

export interface VercelResponse {
  status(code: number): VercelResponse;
  json(data: unknown): void;
  send(data: unknown): void;
  setHeader(name: string, value: string | number): void;
  write(chunk: string): void;
  end(): void;
}

