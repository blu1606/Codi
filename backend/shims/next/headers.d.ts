export interface RequestCookie { name: string; value: string }
export interface CookieStore {
  get(name: string | { name: string }): RequestCookie | undefined;
  getAll(name?: string): RequestCookie[];
  has(name: string): boolean;
  readonly size: number;
  set(name: string, value: string, options?: Record<string, unknown>): CookieStore;
  set(options: { name: string; value: string } & Record<string, unknown>): CookieStore;
  delete(name: string | ({ name: string } & Record<string, unknown>)): CookieStore;
  toString(): string;
}
export function headers(): Promise<Headers>;
export function cookies(): Promise<CookieStore>;
