import { expect,it } from "vitest"; import { parseProviderJson } from "../../src/perplexity/parser";
it("rejects incomplete and malformed payloads",()=>{expect(()=>parseProviderJson({})).toThrow(); expect(()=>parseProviderJson({answer:"ok",sources:[{url:"no"}]})).toThrow(); expect(parseProviderJson({answer:"ok",sources:[]}).sources).toHaveLength(0);});
