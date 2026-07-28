/**
 * Shared SSE stream parser.
 * Yields { event, data } for each SSE message from a ReadableStream response.
 */
export async function* parseSSE(
  response: Response
): AsyncGenerator<{ event: string; data: any }> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Split on double newline (SSE message boundary)
    const parts = buffer.split('\n\n');
    // Keep the last (possibly incomplete) chunk in the buffer
    buffer = parts.pop() || '';

    for (const part of parts) {
      if (!part.trim()) continue;

      let event = 'message';
      let dataStr = '';

      for (const line of part.split('\n')) {
        if (line.startsWith('event: ')) {
          event = line.slice(7);
        } else if (line.startsWith('data: ')) {
          dataStr += (dataStr ? '\n' : '') + line.slice(6);
        }
      }

      if (dataStr) {
        try {
          yield { event, data: JSON.parse(dataStr) };
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }
}
