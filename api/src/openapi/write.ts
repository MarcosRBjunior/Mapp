import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OPENAPI_YAML_PATH, renderOpenApiYaml } from './document.js';

writeFileSync(OPENAPI_YAML_PATH, renderOpenApiYaml());
console.log(`wrote ${fileURLToPath(OPENAPI_YAML_PATH)}`);
