import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {RMT_HEADER} from "../patch-rmt.mjs";

export function patchRmtIram(bytes) {
  if(createHash("sha256").update(bytes).digest("hex")!=="01189d3266629a6a72e2928faa56977b7536d7cf596f927c7355440036b658f7") throw new Error("Expected the pinned four-output RMT header.");
  const source=bytes.toString();
  const signature="    static size_t rmt_encode_led_strip(";
  const start=source.indexOf(signature), end=source.indexOf("    static esp_err_t rmt_del_led_strip_encoder(",start);
  if(start<0||end<0||source.split(signature).length!==2) throw new Error("Encoder boundaries differ.");
  const callback=source.slice(start,end);
  if(callback.includes("T_SPEED")||callback.includes("T_INVERTED")) throw new Error("Callback is template-dependent.");
  const shared=callback.replace(signature,"static size_t IRAM_ATTR loo_rmt_encode_led_strip(");
  const anchor="#define NEOPIXELBUS_RMT_INT_FLAGS";
  let patched=source.slice(0,start)+source.slice(end);
  if(patched.split(anchor).length!==2) throw new Error("Expected one shared callback anchor.");
  patched=patched.replace(anchor,shared+anchor);
  const assignment="led_encoder->base.encode = rmt_encode_led_strip;";
  if(patched.split(assignment).length!==2) throw new Error("Expected one callback assignment.");
  return Buffer.from(patched.replace(assignment,"led_encoder->base.encode = loo_rmt_encode_led_strip;"));
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!process.argv[2]) throw new Error("Provide the pinned NeoPixelBus directory.");
  const path=resolve(process.argv[2],RMT_HEADER),patched=patchRmtIram(await readFile(path));
  await writeFile(path,patched);
  console.log(createHash("sha256").update(patched).digest("hex"));
}
