import { expect, test } from "bun:test";
import { getVault, listVault, removeVault, saveVault } from "../core/vault";

const blob = { salt: btoa("saltsaltsaltsalt"), iv: btoa("nonce-nonce-"), data: btoa("not really plaintext, an opaque blob") };
test("the core keeps only what it is given, as opaque base64, and lists it without the data", () => {
  const r = saveVault({ name: "  Bank  ", ...blob }) as { id: string };
  expect(getVault(r.id)!.data).toBe(blob.data); expect(getVault(r.id)!.name).toBe("Bank");
  const row = listVault().find((x) => x.id === r.id)!; expect("data" in row).toBe(false);
  expect(saveVault({ id: r.id, name: "Bank", ...blob, data: btoa("changed") })).toEqual({ id: r.id });
  expect(getVault(r.id)!.data).toBe(btoa("changed"));
  expect(removeVault(r.id)).toBe(true); expect(removeVault(r.id)).toBe(false);
});
test("a name and well-formed base64 are required; an unknown id is not found", () => {
  expect(saveVault({ name: " ", ...blob })).toEqual({ error: "name" });
  expect(saveVault({ name: "x", ...blob, data: "not base64 !!" })).toEqual({ error: "format" });
  expect(saveVault({ name: "x", ...blob, iv: "" })).toEqual({ error: "format" });
  expect(saveVault({ id: "missing", name: "x", ...blob })).toEqual({ error: "not_found" });
});
