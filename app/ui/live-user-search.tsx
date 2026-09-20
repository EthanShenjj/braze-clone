"use client";

import { useEffect, useState } from "react";
import { Search, UserRound } from "lucide-react";
import type { UserRecord } from "@/lib/braze-store";
import { formatNumber, normalizeLocale, translate, type Locale } from "@/lib/i18n";

type Result = { data: UserRecord[]; total: number; start: number; limit: number };

export default function LiveUserSearch({ locale: localeValue = "en", notify }: { locale?: Locale; notify: (message: string) => void }) {
  const locale = normalizeLocale(localeValue);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [start, setStart] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reachable, setReachable] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { const params = new URLSearchParams(window.location.search); const q = params.get("q") ?? ""; setQuery(q); setSubmitted(q); setStart(Math.max(0, Number(params.get("start") ?? 0) || 0)); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ q: submitted, start: String(start), limit: "20" });
    void fetch(`/api/users?${params}`, { signal: controller.signal }).then(response => response.ok ? response.json() : Promise.reject(new Error("User search failed."))).then(setResult).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [submitted, start]);
  const refreshReach = () => { void fetch("/api/audience/estimate?audience=All+Users").then(response => response.json()).then(data => setReachable(Number(data.reachable))).catch(() => {}); };
  useEffect(refreshReach, []);
  const setUrl = (q: string, offset: number) => { const url = new URL(window.location.href); if (q) url.searchParams.set("q", q); else url.searchParams.delete("q"); if (offset) url.searchParams.set("start", String(offset)); else url.searchParams.delete("start"); window.history.replaceState(null, "", url); };
  const search = () => { setStart(0); setSubmitted(query.trim()); setSelected(null); setError(""); setUrl(query.trim(), 0); };
  const move = (offset: number) => { setStart(offset); setUrl(submitted, offset); };
  const toggle = async (user: UserRecord) => {
    setBusy(user.id); setError("");
    try {
      const response = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: user.id, subscribed: !user.subscribed }) });
      const updated = await response.json();
      if (!response.ok) throw new Error(updated.error ?? "Subscription update failed.");
      setResult(previous => previous ? { ...previous, data: previous.data.map(item => item.id === user.id ? updated : item) } : previous);
      refreshReach(); notify(`${user.id} ${updated.subscribed ? "subscribed" : "unsubscribed"}. Audience estimates updated.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Subscription update failed."); }
    finally { setBusy(null); }
  };
  const profile = result?.data.find(user => user.id === selected);

  return <section className="page-content user-directory"><div className="page-heading"><div><h1>{translate(locale, "Search Users")}</h1><p>{translate(locale, "Inspect synthetic user profiles and update their local subscription state.")}</p></div><div className="user-reach">{reachable == null ? "…" : formatNumber(locale, reachable)}<small>{translate(locale, "Reachable subscribers")}</small></div></div>
    <form className="user-directory-search" onSubmit={event => { event.preventDefault(); search(); }}><Search size={17}/><input aria-label={translate(locale, "Search users")} placeholder={translate(locale, "Search by external ID, email, or name")} value={query} onChange={event => setQuery(event.target.value)}/><button className="primary" type="submit">{translate(locale, "Search")}</button></form>
    {error && <div className="canvas-error" role="alert">{error}</div>}
    <div className="user-directory-layout"><div className="table-wrap"><div className="user-directory-count">{result ? formatNumber(locale, result.total) : "…"} {translate(locale, "users")}</div><table><thead><tr><th>{translate(locale, "External ID")}</th><th>{translate(locale, "Email")}</th><th>{translate(locale, "Country")}</th><th>{translate(locale, "Lifecycle")}</th><th>{translate(locale, "Reachable")}</th><th>{translate(locale, "Subscription")}</th></tr></thead><tbody>{result?.data.length ? result.data.map(user => <tr key={user.id} className={selected === user.id ? "selected" : ""} onClick={() => setSelected(user.id)}><td><button className="user-id-link" onClick={() => setSelected(user.id)}>{user.id}</button></td><td>{user.email}</td><td>{user.country}</td><td>{user.lifecycle}</td><td>{translate(locale, user.reachable ? "Yes" : "No")}</td><td><button className={user.subscribed ? "subscription-on" : "subscription-off"} disabled={busy === user.id} onClick={event => { event.stopPropagation(); void toggle(user); }}>{translate(locale, user.subscribed ? "Subscribed" : "Unsubscribed")}</button></td></tr>) : <tr><td colSpan={6}>{translate(locale, "No users match this search.")}</td></tr>}</tbody></table><div className="user-pagination"><button className="secondary" disabled={start === 0} onClick={() => move(Math.max(0, start - 20))}>{translate(locale, "Previous")}</button><span>{result?.total ? `${formatNumber(locale, start + 1)}–${formatNumber(locale, Math.min(start + 20, result.total))} / ${formatNumber(locale, result.total)}` : `0 ${translate(locale, "users")}`}</span><button className="secondary" disabled={!result || start + 20 >= result.total} onClick={() => move(start + 20)}>{translate(locale, "Next")}</button></div></div>
      <aside className="user-profile"><UserRound size={24}/>{profile ? <><h2>{profile.firstName}</h2><p>{profile.id}</p><dl><div><dt>{translate(locale, "Email")}</dt><dd>{profile.email}</dd></div><div><dt>{translate(locale, "Country")}</dt><dd>{profile.country}</dd></div><div><dt>{translate(locale, "Lifecycle")}</dt><dd>{profile.lifecycle}</dd></div><div><dt>{translate(locale, "Reachable")}</dt><dd>{translate(locale, profile.reachable ? "Yes" : "No")}</dd></div>{Object.entries(profile.attributes).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></> : <><h2>{translate(locale, "User profile")}</h2><p>{translate(locale, "Select a user to inspect attributes.")}</p></>}</aside></div>
  </section>;
}
