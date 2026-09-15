import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  calculateJudgeCalibration,
  judgeCalibrationPasses,
} from "../packages/evaluators/dist/index.js";

const path = resolve("examples/ecommerce-support/judge-calibration.json");
const calibration = JSON.parse(await readFile(path, "utf8"));
const metrics = calculateJudgeCalibration(calibration.samples);

console.log(JSON.stringify(metrics, null, 2));
if (!judgeCalibrationPasses(metrics)) {
  console.error("Judge calibration gate FAILED.");
  process.exitCode = 1;
} else {
  console.log("Judge calibration gate PASSED (deterministic mock evidence).");
}
