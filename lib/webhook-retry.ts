export function webhookRetryDelay(headers:Headers|null,attempt:number,timestamp=Date.now()){
 const retryAfter=headers?.get("retry-after");
 if(retryAfter){const n=Number(retryAfter),delay=Number.isFinite(n)?n*1000:Date.parse(retryAfter)-timestamp;if(Number.isFinite(delay)&&delay>=0)return Math.min(86400000,delay);}
 if(headers?.get("x-ratelimit-remaining")==="0"||headers?.get("x-rate-limit-remaining")==="0"){
  const reset=Number(headers.get("x-ratelimit-reset")??headers.get("x-rate-limit-reset"));if(Number.isFinite(reset)&&reset>0)return Math.min(86400000,Math.max(0,(reset>1e12?reset:reset*1000)-timestamp));
 }
 return Math.min(3600000,1000*2**Math.max(0,attempt-1));
}
