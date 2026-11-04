export declare class NextRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit);
  readonly nextUrl: URL;
  readonly cookies: {
    get(name: string): { name: string; value: string } | undefined;
    getAll(): { name: string; value: string }[];
    has(name: string): boolean;
  };
}
export declare class NextResponse<Body = unknown> extends Response {
  static json<JsonBody>(body: JsonBody, init?: ResponseInit): NextResponse<JsonBody>;
  static redirect(url: string | URL, init?: number | ResponseInit): NextResponse;
  static next(init?: ResponseInit): NextResponse;
}
export declare function after(task: Promise<unknown> | (() => unknown)): void;
