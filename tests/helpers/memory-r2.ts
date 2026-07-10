type Stored = {
  bytes: Uint8Array;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function normalizeHttpMetadata(
  metadata: R2HTTPMetadata | Headers | undefined,
): R2HTTPMetadata | undefined {
  if (!metadata) return undefined;
  if (metadata instanceof Headers) {
    return {
      contentType: metadata.get("content-type") ?? undefined,
      cacheControl: metadata.get("cache-control") ?? undefined,
      contentDisposition: metadata.get("content-disposition") ?? undefined,
      contentEncoding: metadata.get("content-encoding") ?? undefined,
      contentLanguage: metadata.get("content-language") ?? undefined,
    };
  }
  return metadata;
}

export class MemoryR2 {
  readonly objects = new Map<string, Stored>();

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null,
    options: R2PutOptions = {},
  ): Promise<R2Object> {
    let bytes: Uint8Array;
    if (value === null) bytes = new Uint8Array();
    else if (typeof value === "string") bytes = new TextEncoder().encode(value);
    else if (value instanceof ReadableStream) {
      bytes = new Uint8Array(await new Response(value).arrayBuffer());
    } else if (ArrayBuffer.isView(value)) {
      bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    } else bytes = new Uint8Array(value).slice();

    this.objects.set(key, {
      bytes,
      httpMetadata: normalizeHttpMetadata(options.httpMetadata),
      customMetadata: options.customMetadata,
    });
    return this.object(key);
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return {
      ...this.object(key),
      body: new Blob([toArrayBuffer(stored.bytes)]).stream(),
      bodyUsed: false,
      arrayBuffer: async () => toArrayBuffer(stored.bytes),
      bytes: async () => stored.bytes.slice(),
      text: async () => new TextDecoder().decode(stored.bytes),
      json: async <T>() =>
        JSON.parse(new TextDecoder().decode(stored.bytes)) as T,
      blob: async () => new Blob([toArrayBuffer(stored.bytes)]),
    } as R2ObjectBody;
  }

  async head(key: string): Promise<R2Object | null> {
    return this.objects.has(key) ? this.object(key) : null;
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }

  async list(options: R2ListOptions = {}): Promise<R2Objects> {
    const prefix = options.prefix ?? "";
    const objects = [...this.objects.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .map((key) => this.object(key));
    return { objects, truncated: false, delimitedPrefixes: [] };
  }

  private object(key: string): R2Object {
    const stored = this.objects.get(key);
    if (!stored) throw new Error(`Missing object: ${key}`);
    return {
      key,
      version: "memory",
      size: stored.bytes.byteLength,
      etag: "memory",
      httpEtag: '"memory"',
      checksums: {},
      uploaded: new Date(0),
      httpMetadata: stored.httpMetadata,
      customMetadata: stored.customMetadata,
      storageClass: "Standard",
      writeHttpMetadata(headers: Headers) {
        if (stored.httpMetadata?.contentType) {
          headers.set("content-type", stored.httpMetadata.contentType);
        }
      },
    } as R2Object;
  }
}
