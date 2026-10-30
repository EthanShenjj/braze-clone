import type { MessageDraft } from './campaign-shared.ts';

export type CampaignListItem = MessageDraft & { id: string; name: string; status: string; schedule: string; sent: number; edited: string };
export const campaignStatuses = ['All', 'Active', 'Draft', 'Archived', 'Stopped', 'Idle'] as const;
export const campaignColumns = [
  { key: 'stopDate', label: 'Stop date', sortable: true },
  { key: 'type', label: 'Campaign type', sortable: false },
  { key: 'schedule', label: 'Entry schedule', sortable: false },
  { key: 'sent', label: 'Sent', sortable: true },
  { key: 'teams', label: 'Teams', sortable: true },
  { key: 'lastEditedBy', label: 'Last edited by', sortable: false },
  { key: 'edited', label: 'Last edited', sortable: true },
  { key: 'createdBy', label: 'Created by', sortable: false },
] as const;
export type CampaignSort = 'name' | 'stopDate' | 'sent' | 'teams' | 'edited';
export type CampaignListFilters = {
  search: string; status: string; channel: string; tag: string; sort: CampaignSort; direction: 1 | -1;
  start: number; limit: number; createdBy: string; editedBy: string; entrySchedule: string;
  dateField: string; from: string; to: string; expired: string; complexity: string; optimize: string; segment: string;
};
export const emptyCampaignFilters: CampaignListFilters = {
  search: '', status: 'All', channel: 'all', tag: '', sort: 'edited', direction: -1, start: 0, limit: 12,
  createdBy: '', editedBy: '', entrySchedule: '', dateField: 'None', from: '', to: '', expired: '', complexity: '', optimize: '', segment: '',
};
const extraKeys = ['createdBy', 'editedBy', 'entrySchedule', 'dateField', 'from', 'to', 'expired', 'complexity', 'optimize', 'segment'] as const;
export function readCampaignFilters(params: URLSearchParams): CampaignListFilters {
  const status = params.get('columnFilters[status]') ?? 'All';
  const incomingSort = params.get('sortby');
  const sort = incomingSort === 'last_edited' ? 'edited' : incomingSort === 'stop_date' ? 'stopDate' : incomingSort;
  const result = { ...emptyCampaignFilters, search: params.get('globalFilter') ?? '',
    status: campaignStatuses.find(value => value.toLowerCase() === status.toLowerCase()) ?? 'All',
    channel: params.get('channel') ?? 'all', tag: params.get('tag') ?? '',
    sort: (['name','stopDate','sent','teams','edited'].includes(sort ?? '') ? sort : 'edited') as CampaignSort,
    direction: params.get('sortdir') === '1' ? 1 as const : -1 as const,
    start: Math.max(0, Math.floor(Number(params.get('start')) || 0)),
    limit: [12,24,48,96].includes(Number(params.get('limit'))) ? Number(params.get('limit')) : 12 };
  for (const key of extraKeys) if (params.has(`filter_${key}`)) result[key] = params.get(`filter_${key}`) ?? '';
  if(!['None','Date created','Date last edited'].includes(result.dateField))result.dateField='None';
  if(!Number.isSafeInteger(result.start))result.start=0;
  return result;
}
export function writeCampaignFilters(params: URLSearchParams, filters: CampaignListFilters) {
  const next = new URLSearchParams(params);
  next.set('start', String(filters.start)); next.set('limit', String(filters.limit));
  next.set('sortby', filters.sort); next.set('sortdir', String(filters.direction)); next.set('display','list');
  const optional = { globalFilter: filters.search, 'columnFilters[status]': filters.status === 'All' ? '' : filters.status.toLowerCase(), channel: filters.channel === 'all' ? '' : filters.channel, tag: filters.tag };
  for (const [key,value] of Object.entries(optional)) value ? next.set(key,value) : next.delete(key);
  for (const key of extraKeys) filters[key] && filters[key] !== 'None' ? next.set(`filter_${key}`,filters[key]) : next.delete(`filter_${key}`);
  return next;
}
export function campaignTeamNames(campaign: CampaignListItem): string[] {
  const teams = campaign.config?.teams ?? campaign.config?.teamNames ?? campaign.config?.teamIds;
  return Array.isArray(teams) ? teams.map(value => typeof value === 'string' ? value : value&&typeof value==='object'?String((value as {name?:string}).name ?? ''):'').filter(Boolean) : [];
}
export function campaignEntrySchedule(campaign: CampaignListItem) {
  const delivery = campaign.config?.delivery as Record<string,unknown> | undefined;
  return campaign.schedule === 'Action-based' ? 'Action-Based' : campaign.schedule === 'API-triggered' ? 'API-Triggered' : delivery?.frequency && !['Once','One time'].includes(String(delivery.frequency)) ? 'Recurring' : 'One Time';
}
export function campaignStopDate(campaign: CampaignListItem) {
  const delivery = campaign.config?.delivery as Record<string,unknown> | undefined;
  return delivery?.endEnabled ? String(delivery.endTime ?? '') : String(campaign.config?.stopDate ?? '');
}
export function filterCampaigns<T extends CampaignListItem>(campaigns: T[], filters: CampaignListFilters) {
  const timestamp = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
  const rows = campaigns.filter(campaign => {
    const config = campaign.config ?? {};
    if (!campaign.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.status !== 'All' && campaign.status !== filters.status) return false;
    if (filters.channel !== 'all' && campaign.channel !== filters.channel) return false;
    if (filters.tag && !(Array.isArray(config.tags) && config.tags.includes(filters.tag))) return false;
    if (filters.createdBy && config.createdBy !== filters.createdBy) return false;
    if (filters.editedBy && config.lastEditedBy !== filters.editedBy) return false;
    if (filters.entrySchedule && campaignEntrySchedule(campaign) !== filters.entrySchedule) return false;
    if (filters.expired && Boolean(config.interactionDataExpired) !== (filters.expired === 'yes')) return false;
    if (filters.optimize && Boolean(config.optimizeWithBrazeAI ?? config.brazeAIOptimization) !== (filters.optimize === 'yes')) return false;
    if (filters.complexity) {
      const groups = Array.isArray(config.audienceGroups) ? config.audienceGroups as Array<{rules?:unknown[]}> : [];
      const complexity = Number(config.targetingComplexity ?? groups.reduce((total,group) => total + (group.rules?.length ?? 0),0));
      if(filters.complexity==='exceeded'){const threshold=Number(config.targetingComplexityThreshold);if(config.targetingComplexityExceeded!==true&&!(Number.isFinite(threshold)&&complexity>threshold))return false;}
      else if (complexity < Number(filters.complexity)) return false;
    }
    if (filters.segment && !(Array.isArray(config.audienceSegments) ? config.audienceSegments : [campaign.audience]).includes(filters.segment)) return false;
    if (filters.dateField !== 'None') {
      const date = filters.dateField === 'Date created' ? String(config.createdAt ?? '') : campaign.edited;
      if ((filters.from || filters.to) && !date) return false;
      if (filters.from && timestamp(date) < timestamp(filters.from)) return false;
      if (filters.to && timestamp(date) >= timestamp(filters.to) + 86400000) return false;
    }
    return true;
  });
  return rows.sort((a,b) => {
    const field = (row: T): string | number => filters.sort === 'name' ? row.name : filters.sort === 'sent' ? row.sent : filters.sort === 'teams' ? campaignTeamNames(row).join(', ') : timestamp(filters.sort === 'stopDate' ? campaignStopDate(row) : row.edited);
    const left = field(a), right = field(b);
    const result = typeof left === 'number' && typeof right === 'number' ? left-right : String(left).localeCompare(String(right),undefined,{numeric:true,sensitivity:'base'});
    return result * filters.direction || a.id.localeCompare(b.id);
  });
}

export function campaignPaginationPages(current:number,total:number):Array<number|null>{
 const count=Math.max(1,Math.floor(total)),active=Math.max(1,Math.min(count,Math.floor(current))),pages=[...new Set([1,count,active-1,active,active+1])].filter(page=>page>=1&&page<=count).sort((a,b)=>a-b),result:Array<number|null>=[];
 for(const page of pages){if(result.length&&page-Number(result.at(-1))>1)result.push(null);result.push(page);}return result;
}
