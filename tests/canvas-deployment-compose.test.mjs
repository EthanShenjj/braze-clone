import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const available=spawnSync('docker',['compose','version'],{encoding:'utf8',timeout:10000}).status===0;

test('Compose validates and mounts one persistent SQLite volume into both independent processes',{skip:available?false:'Docker Compose CLI is not installed.'},()=>{
  const result=spawnSync('docker',['compose','-f',path.join(root,'compose.yaml'),'config','--format','json'],{cwd:root,encoding:'utf8',timeout:10000,env:{...process.env,BRAZE_HTTP_PORT:'3100',BRAZE_ENV_FILE:path.join(root,'.env.self-hosted-missing-test')}});
  assert.equal(result.status,0,result.stderr);
  const config=JSON.parse(result.stdout),{web,worker}=config.services;
  assert.equal(web.volumes[0].type,'volume');
  assert.equal(web.volumes[0].source,worker.volumes[0].source);
  assert.equal(web.volumes[0].target,'/app/data');
  assert.equal(worker.volumes[0].target,'/app/data');
  assert.equal(web.environment.BRAZE_DATABASE_PATH,'/app/data/braze.sqlite');
  assert.equal(worker.environment.BRAZE_DATABASE_PATH,web.environment.BRAZE_DATABASE_PATH);
  assert.equal(web.environment.CANVAS_WORKER_HEALTH_FILE,worker.environment.CANVAS_WORKER_HEALTH_FILE);
  assert.equal(worker.init,true);
  assert.equal(worker.stop_grace_period,'2m0s');
  assert.equal(web.depends_on.worker.condition,'service_healthy');
});
