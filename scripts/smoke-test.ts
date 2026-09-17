import { it } from "vitest";
import worker from "../src/index";
it("fails closed before provider or binding access", async () => {
  const response = await worker.fetch(new Request("https://smoke.invalid/"), {} as never, {} as ExecutionContext);
  if (response.status !== 503) throw new Error(`expected 503, got ${response.status}`);
  const text = await response.text();
  if (/provider|binding|state/i.test(text)) throw new Error("smoke response exposed provider or binding state");
  console.log("PASS smoke: missing configuration fails closed before provider/binding access");
});
