/** Download with current account authorization, never a transferable signed URL. */
export async function readPrivateFile<T>(download: () => Promise<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await download();
  if (error || !data) throw new Error(error?.message ?? "Could not open file");
  return data;
}