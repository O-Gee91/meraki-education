import { expect, it, vi } from "vitest";
import { readPrivateFile } from "./private-file";

it("rechecks file permission on every open and rejects removed members", async () => {
  const read = vi.fn().mockResolvedValueOnce({ data: "private-file", error: null }).mockResolvedValueOnce({ data: null, error: { message: "Forbidden" } });
  expect(await readPrivateFile(read)).toBe("private-file");
  await expect(readPrivateFile(read)).rejects.toThrow("Forbidden");
  expect(read).toHaveBeenCalledTimes(2);
});