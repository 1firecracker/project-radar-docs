const encoder = new TextEncoder();

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function isAuthorized(
  authorization: string | null,
  expectedToken: string,
): boolean {
  if (!authorization?.startsWith("Bearer ") || expectedToken.length === 0) {
    return false;
  }
  return constantTimeEqual(authorization.slice(7), expectedToken);
}
