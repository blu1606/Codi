export declare function onRevalidate(listener: () => void): void;
export declare function revalidatePath(path: string, type?: "page" | "layout"): void;
export declare function revalidateTag(tag: string, profile?: unknown): void;
export declare function updateTag(tag: string): void;
export declare function refresh(): void;
export declare function unstable_noStore(): void;
export declare function unstable_cache<T extends (...args: never[]) => unknown>(fn: T, keyParts?: string[], options?: unknown): T;
