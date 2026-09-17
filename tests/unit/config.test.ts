import {describe,expect,it} from "vitest"; import {loadConfig} from "../../src/config";
describe("config",()=>{it("loads valid",()=>expect(loadConfig({OWNER_EMAIL:"A@B.com"}).ownerEmail).toBe("a@b.com")); it("fails closed",()=>{expect(()=>loadConfig({})).toThrow();expect(()=>loadConfig({OWNER_EMAIL:"invalid"})).toThrow();});});
