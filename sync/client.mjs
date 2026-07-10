import { buildManifest, scanSignature, scanSource } from "./core.mjs";

export class SyncError extends Error {
  constructor(message, { retryable = true, status } = {}) {
    super(message);
    this.name = "SyncError";
    this.retryable = retryable;
    this.status = status;
  }
}

export class SyncAuthError extends SyncError {
  constructor() {
    super("Synchronization credentials were rejected", {
      retryable: false,
      status: 401,
    });
    this.name = "SyncAuthError";
  }
}

function endpointUrl(endpoint, path) {
  return `${endpoint.replace(/\/$/, "")}${path}`;
}

async function checkedFetch(fetchImpl, url, init, expected) {
  const response = await fetchImpl(url, init);
  if (response.status === 401) throw new SyncAuthError();
  if (!expected.includes(response.status)) {
    throw new SyncError(`Synchronization request failed with status ${response.status}`, {
      status: response.status,
    });
  }
  return response;
}

export async function syncOnce(config, fetchImpl = fetch) {
  for (let conflictAttempt = 0; conflictAttempt < 5; conflictAttempt += 1) {
    const firstScan = await scanSource(config.sourceDir);
    const authorization = `Bearer ${config.token}`;
    const statusResponse = await checkedFetch(
      fetchImpl,
      endpointUrl(config.endpoint, "/api/sync/status"),
      { headers: { authorization } },
      [200],
    );
    const status = await statusResponse.json();
    if (
      !status ||
      (status.revision !== null && typeof status.revision !== "string") ||
      !Array.isArray(status.hashes)
    ) {
      throw new SyncError("Synchronization status is malformed");
    }
    const remoteHashes = new Set(status.hashes);
    for (const file of firstScan) {
      if (remoteHashes.has(file.sha256)) continue;
      await checkedFetch(
        fetchImpl,
        endpointUrl(config.endpoint, `/api/sync/objects/${file.sha256}`),
        {
          method: "PUT",
          headers: {
            authorization,
            "content-type": file.mediaType,
            "content-length": String(file.content.byteLength),
          },
          body: file.content,
        },
        [201, 204],
      );
    }

    const finalScan = await scanSource(config.sourceDir);
    if (scanSignature(firstScan) !== scanSignature(finalScan)) continue;
    const manifest = buildManifest(finalScan);
    const commitResponse = await fetchImpl(
      endpointUrl(config.endpoint, "/api/sync/commit"),
      {
        method: "POST",
        headers: {
          authorization,
          "content-type": "application/json",
        },
        body: JSON.stringify({ baseRevision: status.revision, manifest }),
      },
    );
    if (commitResponse.status === 401) throw new SyncAuthError();
    if (commitResponse.status === 409) continue;
    if (!commitResponse.ok) {
      throw new SyncError(
        `Synchronization commit failed with status ${commitResponse.status}`,
        { status: commitResponse.status },
      );
    }
    return { manifest };
  }
  throw new SyncError("Synchronization conflicted too many times");
}
