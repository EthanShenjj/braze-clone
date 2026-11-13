import type {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';

export type CanvasRuntimeState={id:string;status:string;updatedAt:string;data:Record<string,unknown>};
type Row={id:string;status:string;updated_at:string;data_json:string};
const resourceType='canvas-runtime-state';
const fields='id,status,updated_at,data_json';
function identity(kind:string,workspaceId:string,canvasId:string,keys:string[]):string{
 if(typeof kind!=='string'||!kind||typeof workspaceId!=='string'||!workspaceId||typeof canvasId!=='string'||!Array.isArray(keys)||keys.some(key=>typeof key!=='string'))throw new TypeError('Supply a runtime state kind, workspace, Canvas and string keys.');
 return 'canvas-runtime:'+createHash('sha256').update(JSON.stringify([kind,workspaceId,canvasId,keys])).digest('hex');
}
function state(row:Row):CanvasRuntimeState{return{id:row.id,status:row.status,updatedAt:row.updated_at,data:JSON.parse(row.data_json) as Record<string,unknown>};}
function payload(data:Record<string,unknown>,kind:string,workspaceId:string,canvasId:string):string{
 if(!data||typeof data!=='object'||Array.isArray(data))throw new TypeError('Runtime state data must be a JSON object.');
 return JSON.stringify({...data,kind,workspaceId,canvasId});
}

/** Shares the caller's SQLite connection and transaction, without a process-local state cache. */
export class CanvasRuntimePersistence{
 private readonly db:DatabaseSync;
 constructor(db:DatabaseSync){
  this.db=db;
  // Repeat this DDL for every construction: a caller may roll back a previous constructor.
  db.exec(`CREATE INDEX IF NOT EXISTS canvas_runtime_scope ON resources(type,json_extract(data_json,'$.kind'),json_extract(data_json,'$.workspaceId'),json_extract(data_json,'$.canvasId'),json_extract(data_json,'$.userId'),json_extract(data_json,'$.runId')) WHERE type='canvas-runtime-state' AND json_valid(data_json)`);
 }
 get(kind:string,workspaceId:string,canvasId:string,keys:string[]=[]):CanvasRuntimeState|null{
  const row=this.db.prepare(`SELECT ${fields} FROM resources WHERE id=? AND type=? AND json_valid(data_json) AND json_extract(data_json,'$.kind')=? AND json_extract(data_json,'$.workspaceId')=? AND json_extract(data_json,'$.canvasId')=?`).get(identity(kind,workspaceId,canvasId,keys),resourceType,kind,workspaceId,canvasId) as Row|undefined;
  return row?state(row):null;
 }
 put(kind:string,workspaceId:string,canvasId:string,keys:string[],data:Record<string,unknown>,status='Active'):CanvasRuntimeState{
  const id=identity(kind,workspaceId,canvasId,keys),json=payload(data,kind,workspaceId,canvasId);
  const row=this.db.prepare(`INSERT INTO resources(id,type,name,status,description,updated_at,data_json) VALUES(?,?,?,?,?,?,?)
   ON CONFLICT(id) DO UPDATE SET status=excluded.status,
    updated_at=CASE WHEN resources.updated_at>=excluded.updated_at THEN strftime('%Y-%m-%dT%H:%M:%fZ',resources.updated_at,'+0.001 seconds') ELSE excluded.updated_at END,
    data_json=(SELECT json_group_object(key,json(CASE type WHEN 'text' THEN json_quote(value) WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' WHEN 'null' THEN 'null' ELSE value END)) FROM (
     SELECT key,value,type FROM json_each(resources.data_json) WHERE key NOT IN(SELECT key FROM json_each(excluded.data_json))
     UNION ALL SELECT key,value,type FROM json_each(excluded.data_json)))
   WHERE resources.type=excluded.type AND json_extract(resources.data_json,'$.kind')=? AND json_extract(resources.data_json,'$.workspaceId')=? AND json_extract(resources.data_json,'$.canvasId')=?
   RETURNING ${fields}`).get(id,resourceType,kind,status,'Canvas runtime state',new Date().toISOString(),json,kind,workspaceId,canvasId) as Row|undefined;
  if(!row)throw new Error('Runtime state identity conflicts with another resource scope.');
  return state(row);
 }
 insertIfAbsent(kind:string,workspaceId:string,canvasId:string,keys:string[],data:Record<string,unknown>,status='Active'):boolean{
  const id=identity(kind,workspaceId,canvasId,keys),json=payload(data,kind,workspaceId,canvasId);
  const result=this.db.prepare('INSERT INTO resources(id,type,name,status,description,updated_at,data_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,resourceType,kind,status,'Canvas runtime state',new Date().toISOString(),json);
  return Number(result.changes)===1;
 }
 list(kind:string,scope:{workspaceId:string;canvasId?:string;userId?:string;runId?:string}):CanvasRuntimeState[]{
  identity(kind,scope.workspaceId,scope.canvasId??'',[]);
  const clauses=["type='canvas-runtime-state'",'json_valid(data_json)',"json_extract(data_json,'$.kind')=?","json_extract(data_json,'$.workspaceId')=?"],values=[kind,scope.workspaceId];
  for(const key of ['canvasId','userId','runId'] as const)if(scope[key]!==undefined){if(typeof scope[key]!=='string')throw new TypeError('Runtime state scope values must be strings.');clauses.push(`json_extract(data_json,'$.${key}')=?`);values.push(scope[key]);}
  return(this.db.prepare(`SELECT ${fields} FROM resources WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC,id`).all(...values) as Row[]).map(state);
 }
}
