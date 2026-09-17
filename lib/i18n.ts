export const supportedLocales = ["en", "zh-CN", "ko", "ja"] as const;
export type Locale = typeof supportedLocales[number];

export const localeNames: Record<Locale, string> = { en: "English", "zh-CN": "中文", ko: "한국어", ja: "日本語" };

const dictionaries: Record<Exclude<Locale, "en">, Record<string, string>> = {
  "zh-CN": {
    "Search workspace": "搜索工作区", "Quick links": "快捷链接", "Canvas": "画布", "Campaigns": "营销活动", "Segments": "细分", "Getting Started": "入门", "Performance Overview": "效果概览", "Agent Console": "智能体控制台", "Messaging": "消息", "Audience": "受众", "Content": "内容", "Analytics": "分析", "Partner Integrations": "合作伙伴集成", "Data Settings": "数据设置", "Settings": "设置", "Catalogs": "目录", "View only": "仅查看", "Search": "搜索", "Clear search": "清除搜索", "Results": "个结果", "Name": "名称", "Description": "描述", "Source": "来源", "Items": "项目", "Total size": "总大小", "Last updated": "上次更新", "Preview": "预览", "Selections": "精选", "Create recommendation": "创建推荐", "Language": "语言", "User preview": "用户预览", "Get random user": "获取随机用户", "Generate preview": "生成预览", "Close": "关闭"
  },
  ko: {
    "Search workspace": "워크스페이스 검색", "Quick links": "빠른 링크", "Canvas": "캔버스", "Campaigns": "캠페인", "Segments": "세그먼트", "Getting Started": "시작하기", "Performance Overview": "성과 개요", "Agent Console": "에이전트 콘솔", "Messaging": "메시징", "Audience": "오디언스", "Content": "콘텐츠", "Analytics": "분석", "Partner Integrations": "파트너 통합", "Data Settings": "데이터 설정", "Settings": "설정", "Catalogs": "카탈로그", "View only": "보기 전용", "Search": "검색", "Clear search": "검색 지우기", "Results": "개 결과", "Name": "이름", "Description": "설명", "Source": "소스", "Items": "항목", "Total size": "전체 크기", "Last updated": "마지막 수정", "Preview": "미리보기", "Selections": "선택", "Create recommendation": "추천 만들기", "Language": "언어", "User preview": "사용자 미리보기", "Get random user": "임의 사용자 가져오기", "Generate preview": "미리보기 생성", "Close": "닫기"
  },
  ja: {
    "Search workspace": "ワークスペースを検索", "Quick links": "クイックリンク", "Canvas": "キャンバス", "Campaigns": "キャンペーン", "Segments": "セグメント", "Getting Started": "はじめに", "Performance Overview": "パフォーマンス概要", "Agent Console": "エージェントコンソール", "Messaging": "メッセージング", "Audience": "オーディエンス", "Content": "コンテンツ", "Analytics": "分析", "Partner Integrations": "パートナー連携", "Data Settings": "データ設定", "Settings": "設定", "Catalogs": "カタログ", "View only": "閲覧のみ", "Search": "検索", "Clear search": "検索をクリア", "Results": "件の結果", "Name": "名前", "Description": "説明", "Source": "ソース", "Items": "アイテム", "Total size": "合計サイズ", "Last updated": "最終更新", "Preview": "プレビュー", "Selections": "選択", "Create recommendation": "レコメンデーションを作成", "Language": "言語", "User preview": "ユーザープレビュー", "Get random user": "ランダムユーザーを取得", "Generate preview": "プレビューを生成", "Close": "閉じる"
  }
};

export function normalizeLocale(value: string | null | undefined): Locale { return supportedLocales.includes(value as Locale) ? value as Locale : "en"; }
export function translate(locale: Locale, text: string) { return locale === "en" ? text : dictionaries[locale][text] ?? text; }
