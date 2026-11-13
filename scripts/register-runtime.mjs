import {registerHooks} from 'node:module';
import {existsSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const [major,minor,patch]=process.versions.node.split('.').map(Number);
if(major!==22||minor<22||minor===22&&patch<3)throw new Error('The Canvas worker requires Node 22.22.3 or newer within Node 22.x.');

const root=fileURLToPath(new URL('../',import.meta.url));
const projectFile=filename=>filename.startsWith(root)&&!path.relative(root,filename).split(path.sep).includes('node_modules');
const isFile=filename=>existsSync(filename)&&statSync(filename).isFile();

// Native Node performs TypeScript transformation and package condition selection.
// Only fill the two resolution conventions used by this project's server modules.
registerHooks({
  resolve(specifier,context,nextResolve){
    let target=specifier,candidate;
    if(specifier.startsWith('@/')){
      candidate=path.resolve(root,specifier.slice(2));
      if(!projectFile(candidate))throw new Error('Project alias resolves outside the application.');
      target=pathToFileURL(candidate).href;
    }else if((specifier.startsWith('./')||specifier.startsWith('../'))&&context.parentURL?.startsWith('file:')){
      const parent=fileURLToPath(context.parentURL);
      if(projectFile(parent))candidate=fileURLToPath(new URL(specifier,context.parentURL));
    }
    try{return nextResolve(target,context);}catch(error){
      if(!candidate||!projectFile(candidate)||path.extname(candidate)||!['ERR_MODULE_NOT_FOUND','ERR_UNSUPPORTED_DIR_IMPORT'].includes(error.code))throw error;
      const typescript=`${candidate}.ts`;
      if(!isFile(typescript))throw error;
      return nextResolve(pathToFileURL(typescript).href,context);
    }
  },
});
