import fs from 'node:fs';
import path from 'node:path';
import Module, {createRequire} from 'node:module';
import ts from 'typescript';

// Exercise real synchronous client components with React's server renderer.
// The app's TypeScript and CSS imports need the same resolution they get in Next.
const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,'..');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(specifier,...args){
  return resolve.call(this,specifier.startsWith('@/')?path.join(root,specifier.slice(2)):specifier,...args);
};
for(const extension of ['.ts','.tsx'])Module._extensions[extension]=(module,filename)=>{
  const result=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:filename});
  module._compile(result.outputText,filename);
};
Module._extensions['.css']=module=>{module.exports=new Proxy({},{get:(_,key)=>key==='__esModule'?false:String(key)});};
export const loadComponent=filename=>require(path.join(root,filename));
