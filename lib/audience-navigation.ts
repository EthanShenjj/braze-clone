/** Native Audience paths observed in the source audit; query parameters take priority in callers. */
export type AudiencePathContext={workspaceId?:string;segmentId?:string;groupId?:string;preferenceNew?:boolean;locationNew?:boolean;page?:'segments'|'segment-insights'|'segment-extensions'|'global-control-group'|'subscription-group-management'|'email-preference-centers'|'search-users'|'manage-audience'|'import-users'|'locations'};
const legacyLocalWorkspaces=new Set(['local','6aa75e37db69160082adb7ae']);
function workspace(id:string):string{return legacyLocalWorkspaces.has(id)?'local':id;}
export function audiencePathContext(pathname:string):AudiencePathContext {
 const path=pathname.split(/[?#]/,1)[0].replace(/\/$/,'');let match:RegExpMatchArray|null;
 if((match=path.match(/^\/engagement\/global_message_settings\/global-control-settings\/([^/]+)$/)))return{page:'global-control-group',workspaceId:workspace(match[1])};
 if((match=path.match(/^\/engagement\/segmenter\/edit\/([^/]+)\/([^/]+)$/)))return{page:'segments',segmentId:match[1],workspaceId:workspace(match[2])};
 if((match=path.match(/^\/engagement\/segmenter\/segmenter\/([^/]+)$/)))return{page:'segments',workspaceId:workspace(match[1])};
 if((match=path.match(/^\/engagement\/segmenter\/segment_insights\/([^/]+)$/)))return{page:'segment-insights',workspaceId:workspace(match[1])};
 if((match=path.match(/^\/engagement\/segment_cohorts\/segment_cohorts\/([^/]+)$/)))return{page:'segment-extensions',workspaceId:workspace(match[1])};
 if((match=path.match(/^\/users\/subscription_groups\/preference_centers\/([^/]+)(\/new)?$/)))return{page:'email-preference-centers',workspaceId:workspace(match[1]),...(match[2]?{preferenceNew:true}:{})};
 if((match=path.match(/^\/users\/subscription_groups\/subscription_groups\/([^/]+)$/)))return{page:'subscription-group-management',workspaceId:workspace(match[1])};
 if((match=path.match(/^\/users\/subscription_groups\/([^/]+)\/([^/]+)$/)))return ['preference_centers','subscription_groups'].includes(match[1])?{}:{page:'subscription-group-management',groupId:match[1],workspaceId:workspace(match[2])};
 // The short subscription list path is the clone's existing legacy route.
 if((match=path.match(/^\/users\/subscription_groups\/([^/]+)$/)))return{page:'subscription-group-management',workspaceId:workspace(match[1])};
 if((match=path.match(/^\/users\/user_search\/user-search\/([^/]+)$/)))return{page:'search-users',workspaceId:workspace(match[1])};
 if((match=path.match(/^\/users\/manage_audience\/([^/]+)$/)))return{page:'manage-audience',workspaceId:workspace(match[1])};
 if((match=path.match(/^\/users\/user_import\/([^/]+)$/)))return{page:'import-users',workspaceId:workspace(match[1])};
 if((match=path.match(/^\/engagement\/locations\/create_location_set\/([^/]+)$/)))return{page:'locations',workspaceId:workspace(match[1]),locationNew:true};
 if((match=path.match(/^\/engagement\/locations\/([^/]+)$/)))return{page:'locations',workspaceId:workspace(match[1])};
 return{};
}
export function audienceWorkspaceId(pathname:string,params:Pick<URLSearchParams,'get'>):string{return params.get('workspace')||params.get('workspaceId')||audiencePathContext(pathname).workspaceId||'local';}
