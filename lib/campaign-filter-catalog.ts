/** Catalog labels and descriptions verified against the saved live Braze accessibility captures. */
export type CampaignFilterChoice={label:string;description?:string;field?:string;group?:string;children?:CampaignFilterChoice[];requiresAttribute?:string;unavailable?:string;dynamic?:string};
export type CampaignFilterCategory={name:string;description:string;fields:CampaignFilterChoice[]};
export const audienceFilterCatalog:CampaignFilterCategory[] = [
  {
    "name": "Segment or CSV membership",
    "description": "User membership in other segments, Segment Extension, or imported CSV",
    "fields": []
  },
  {
    "name": "Custom attributes",
    "description": "User characteristics that your company has set up",
    "fields": []
  },
  {
    "name": "Custom events",
    "description": "User actions that your company has set up",
    "fields": []
  },
  {
    "name": "Sessions",
    "description": "Session count, first and last session, and median session duration",
    "fields": [
      {
        "label": "Session count",
        "description": "",
        "children": [
          {
            "label": "Session Count",
            "description": "Number of sessions users had in any of your apps",
            "field": "session_count"
          },
          {
            "label": "Session Count For App",
            "description": "Number of sessions users had in a specific app",
            "dynamic": "app-session-count"
          },
          {
            "label": "X Sessions in Last Y Days",
            "description": "Number of app sessions in the last 1-30 days",
            "dynamic": "session-recent"
          }
        ]
      },
      {
        "label": "First session",
        "description": "",
        "children": [
          {
            "label": "First Used App",
            "description": "Users by when they first opened an app",
            "field": "first_session_at"
          },
          {
            "label": "First Used Specific App",
            "description": "Users by when they first opened an app in a workspace",
            "dynamic": "app-first-session"
          }
        ]
      },
      {
        "label": "Last session",
        "description": "",
        "children": [
          {
            "label": "Last Used App",
            "description": "Users by the last time they opened your app",
            "field": "last_session_at"
          },
          {
            "label": "Last Used Specific App",
            "description": "Users by the last time they opened a specific app",
            "dynamic": "app-last-session"
          }
        ]
      },
      {
        "label": "Median Session Duration",
        "description": "Users by the median time of their sessions in your app",
        "group": "Other Filters",
        "field": "median_session_duration_seconds"
      }
    ]
  },
  {
    "name": "Retargeting",
    "description": "Past interactions with messages and channels",
    "fields": [
      {
        "label": "Received campaign/Canvas",
        "description": "",
        "children": [
          {
            "label": "Received Message from Campaign",
            "description": "Received a message from a specific campaign",
            "dynamic": "campaign-delivered"
          },
          {
            "label": "Received Campaign Variant",
            "description": "Campaign variant users received in an a/b test",
            "dynamic": "campaign-variants"
          },
          {
            "label": "Received Message from Canvas Step",
            "description": "Users who received a message from a specific Canvas step",
            "unavailable": "This data source is not connected to this workspace."
          },
          {
            "label": "Received Feature Flag Variant",
            "description": "Feature Flag experiment variant users received in an a/b test",
            "dynamic": "feature-variants"
          },
          {
            "label": "Last Received Message from Specific Canvas Step",
            "description": "When a user last received a specific campaign",
            "unavailable": "This data source is not connected to this workspace."
          },
          {
            "label": "Last Received Message from Specific Campaign",
            "description": "Last message received was from a specific campaign",
            "dynamic": "campaign-last-delivered"
          },
          {
            "label": "Received Message from Campaign or Canvas with Tag",
            "description": "Received any message with a specific tag",
            "unavailable": "This data source is not connected to this workspace."
          },
          {
            "label": "Last Received Message from Campaign or Canvas With Tag",
            "description": "Last message received was from a Campaign or Canvas with a specific tag",
            "unavailable": "This data source is not connected to this workspace."
          },
          {
            "label": "Has Never Received a Message from Campaign or Canvas Step",
            "description": "Users who have never received any messages",
            "field": "never_received_message"
          }
        ]
      },
      {
        "label": "Last channel receipt/engagement",
        "description": "",
        "children": [
          {
            "label": "Last Received Email",
            "description": "Users by the last time they received an email",
            "field": "receipt_channel_last:email"
          },
          {
            "label": "Last Received Push",
            "description": "Users by the last time a push notification was sent",
            "field": "receipt_channel_last:push"
          },
          {
            "label": "Last In App Message Impression",
            "description": "Users by the last time they viewed an in-app message",
            "field": "receipt_channel_last:iam"
          },
          {
            "label": "Last Received SMS/MMS/RCS",
            "description": "Users by the last time a message was sent to the provider",
            "field": "receipt_channel_last:sms"
          },
          {
            "label": "Last Received Webhook",
            "description": "Users by the last time a webhook was sent",
            "field": "receipt_channel_last:webhook"
          },
          {
            "label": "Last Received WhatsApp",
            "description": "",
            "field": "receipt_channel_last:whatsapp"
          }
        ]
      },
      {
        "label": "Clicked/opened campaign or Canvas",
        "description": "",
        "children": [
          {
            "label": "Clicked/Opened Campaign",
            "description": "Interaction with a specific campaign",
            "dynamic": "campaign-engaged"
          },
          {
            "label": "Clicked/Opened Campaign or Canvas With Tag",
            "description": "Interaction with a specific campaign",
            "unavailable": "This data source is not connected to this workspace."
          },
          {
            "label": "Clicked/Opened Step",
            "description": "Interaction with a specific Canvas component",
            "unavailable": "This data source is not connected to this workspace."
          }
        ]
      },
      {
        "label": "Email",
        "description": "",
        "children": [
          {
            "label": "Clicked Alias in Campaign",
            "description": "",
            "dynamic": "link-aliases"
          },
          {
            "label": "Clicked Alias in Canvas Step",
            "description": "",
            "unavailable": "This data source is not connected to this workspace."
          },
          {
            "label": "Clicked Alias in any Campaign or Canvas Step",
            "description": "",
            "dynamic": "link-aliases"
          },
          {
            "label": "Hard Bounced",
            "description": "Users with email addresses that have hard bounced",
            "field": "attr:email_hard_bounced",
            "requiresAttribute": "email_hard_bounced"
          },
          {
            "label": "Has Marked You As Spam",
            "description": "Users who marked your messages as spam",
            "field": "attr:email_marked_spam",
            "requiresAttribute": "email_marked_spam"
          },
          {
            "label": "Soft Bounced",
            "description": "Users with email addresses that have soft bounced",
            "field": "attr:email_soft_bounced",
            "requiresAttribute": "email_soft_bounced"
          }
        ]
      },
      {
        "label": "SMS",
        "description": "",
        "unavailable": "This integration data is not connected to this workspace."
      },
      {
        "label": "Converted",
        "description": "",
        "children": [
          {
            "label": "Converted From Campaign",
            "description": "Users who performed a campaign conversion event",
            "dynamic": "campaign-conversion"
          },
          {
            "label": "Converted From Canvas",
            "description": "Users who performed a Canvas conversion event",
            "unavailable": "This data source is not connected to this workspace."
          }
        ]
      },
      {
        "label": "Control group membership",
        "description": "",
        "children": [
          {
            "label": "In Campaign Control Group",
            "description": "Users in the control group of an a/b test campaign",
            "dynamic": "campaign-control"
          },
          {
            "label": "In Canvas Control Group",
            "description": "Users in the control group of a Canvas",
            "unavailable": "This data source is not connected to this workspace."
          },
          {
            "label": "Last Enrolled in Any Control Group",
            "description": "Users by the last time they were in a control group",
            "field": "last_control_at"
          }
        ]
      },
      {
        "label": "Feature Flags",
        "description": "",
        "children": [
          {
            "label": "Feature Flags",
            "description": "Users who have a specific feature flag turned on",
            "dynamic": "feature-flags"
          }
        ]
      },
      {
        "label": "Survey",
        "description": "",
        "children": [
          {
            "label": "Submitted Survey on Landing Page",
            "description": "Users who last submitted a survey on a specific landing page",
            "unavailable": "This data source is not connected to this workspace."
          },
          {
            "label": "Submitted Survey in Campaign",
            "description": "Users who last submitted a survey in a specific campaign",
            "unavailable": "This data source is not connected to this workspace."
          },
          {
            "label": "Submitted Survey in Canvas Step",
            "description": "Users who last submitted a survey in a specific canvas step",
            "unavailable": "This data source is not connected to this workspace."
          }
        ]
      },
      {
        "label": "Entered Canvas Variation",
        "description": "Users by whether they have entered a variation path of a specific canvas",
        "group": "Other Filters",
        "unavailable": "This integration data is not connected to this workspace."
      },
      {
        "label": "Last Received Any Message",
        "description": "Users by whether the last mesage was received",
        "group": "Other Filters",
        "field": "last_received_message_at"
      },
      {
        "label": "Last Engaged With Message",
        "description": "Users by the last time they clicked or opened a message",
        "group": "Other Filters",
        "field": "last_engaged_message_at"
      },
      {
        "label": "Submitted Form on Landing Page",
        "description": "Users who have submitted a form on a specific landing page",
        "group": "Other Filters",
        "unavailable": "This integration data is not connected to this workspace."
      }
    ]
  },
  {
    "name": "Channel subscription behavior",
    "description": "User subscription behavior for specific messaging channels",
    "fields": [
      {
        "label": "Email",
        "description": "",
        "children": [
          {
            "label": "Email Available",
            "description": "Whether users have a valid email address",
            "field": "email_available"
          },
          {
            "label": "Email Opt In Date",
            "description": "Users by the date on which they opted in for email",
            "field": "attr:email_opt_in_date",
            "requiresAttribute": "email_opt_in_date"
          },
          {
            "label": "Email Subscription Status",
            "description": "Users by their subscription status for email",
            "field": "emailSubscriptionStatus"
          },
          {
            "label": "Email Unsubscribed Date",
            "description": "Users by the date on which they unsubscribed from future emails",
            "field": "attr:email_unsubscribed_date",
            "requiresAttribute": "email_unsubscribed_date"
          }
        ]
      },
      {
        "label": "Push",
        "description": "",
        "children": [
          {
            "label": "Foreground Push Enabled",
            "description": "Users who are foreground push enabled and whose push subscription status is not unsubscribed, for any of your apps",
            "field": "attr:foreground_push_enabled",
            "requiresAttribute": "foreground_push_enabled"
          },
          {
            "label": "Foreground Push Enabled for App",
            "description": "Users who are foreground push enabled for an app. This does not take push subscription status into account.",
            "unavailable": "This data source is not connected to this workspace."
          },
          {
            "label": "Background or Foreground Push Enabled",
            "description": "Users who are background or foreground push enabled for any of your apps",
            "field": "attr:push_enabled",
            "requiresAttribute": "push_enabled"
          },
          {
            "label": "Push Opt In Date",
            "description": "Date users opted-in for push",
            "field": "attr:push_opt_in_date",
            "requiresAttribute": "push_opt_in_date"
          },
          {
            "label": "Push Subscription Status",
            "description": "Subscription status for push notifications",
            "field": "attr:push_subscription_status",
            "requiresAttribute": "push_subscription_status"
          },
          {
            "label": "Push Unsubscribed Date",
            "description": "Date users unsubscribed from push notifications",
            "field": "attr:push_unsubscribed_date",
            "requiresAttribute": "push_unsubscribed_date"
          }
        ]
      },
      {
        "label": "Subscription Group",
        "description": "Users by subscription group for channels that require opt-in",
        "group": "Other Filters",
        "dynamic": "subscription-groups"
      }
    ]
  },
  {
    "name": "Demographic attributes",
    "description": "User demographic information including country, city, language, birthday, and more",
    "fields": [
      {
        "label": "Country",
        "description": "Last indicated country location",
        "field": "country"
      },
      {
        "label": "City",
        "description": "Last indicated city location",
        "field": "attr:city"
      },
      {
        "label": "Language",
        "description": "Users by their preferred language",
        "field": "attr:language"
      },
      {
        "label": "Shopify Market",
        "description": "",
        "field": "attr:shopify_market",
        "requiresAttribute": "shopify_market"
      },
      {
        "label": "Age",
        "description": "Users that are older than, younger than, or exactly a specific age",
        "field": "age"
      },
      {
        "label": "Birthday",
        "description": "User birthday",
        "field": "attr:dob"
      },
      {
        "label": "Gender",
        "description": "Users by gender",
        "field": "attr:gender"
      },
      {
        "label": "Unformatted Phone Number",
        "description": "Users by phone number, unformatted and without symbols",
        "field": "phone_unformatted"
      },
      {
        "label": "First Name",
        "description": "Users by their first name",
        "field": "first_name"
      },
      {
        "label": "Last Name",
        "description": "Users by their last name",
        "field": "attr:last_name"
      }
    ]
  },
  {
    "name": "App",
    "description": "Usage behavior for specific apps and app versions",
    "fields": [
      {
        "label": "Has App",
        "description": "Users who have ever installed your app",
        "field": "attr:app_id",
        "requiresAttribute": "app_id"
      },
      {
        "label": "Most Recent App Version Name",
        "description": "Most recent name of the user's app",
        "field": "attr:app_version_name",
        "requiresAttribute": "app_version_name"
      },
      {
        "label": "Most Recent App Version Number",
        "description": "Most recent version number of a user's app",
        "field": "attr:app_version",
        "requiresAttribute": "app_version"
      }
    ]
  },
  {
    "name": "Uninstall",
    "description": "App uninstall behavior and date",
    "fields": [
      {
        "label": "Uninstalled",
        "description": "Users who uninstalled and didn't reinstall your app",
        "field": "attr:uninstalled",
        "requiresAttribute": "uninstalled"
      },
      {
        "label": "Uninstall Date",
        "description": "Date users uninstalled your app",
        "field": "attr:uninstall_date",
        "requiresAttribute": "uninstall_date"
      }
    ]
  },
  {
    "name": "Devices",
    "description": "User device information, including model, OS, ad tracking, and more",
    "fields": [
      {
        "label": "Advertising use cases",
        "description": "",
        "children": [
          {
            "label": "Device IDFA",
            "description": "Users by advertising identifier for testing",
            "field": "attr:idfa",
            "requiresAttribute": "idfa"
          },
          {
            "label": "Device IDFV",
            "description": "Users by identifier for vendor for testing",
            "field": "attr:idfv",
            "requiresAttribute": "idfv"
          },
          {
            "label": "Device Google Ad ID",
            "description": "Users by Google advertising identifier for testing",
            "field": "attr:google_ad_id",
            "requiresAttribute": "google_ad_id"
          },
          {
            "label": "Device Roku Ad ID",
            "description": "",
            "field": "attr:roku_ad_id",
            "requiresAttribute": "roku_ad_id"
          },
          {
            "label": "Device Windows Ad ID",
            "description": "",
            "field": "attr:windows_ad_id",
            "requiresAttribute": "windows_ad_id"
          },
          {
            "label": "Ad Tracking Enabled",
            "description": "Users opted-in to ad tracking on ios",
            "field": "attr:ad_tracking_enabled",
            "requiresAttribute": "ad_tracking_enabled"
          }
        ]
      },
      {
        "label": "Device Carrier",
        "description": "Users by device carrier",
        "group": "Other Filters",
        "field": "attr:device_carrier",
        "requiresAttribute": "device_carrier"
      },
      {
        "label": "Device Count",
        "description": "How many devices users have used your app on",
        "group": "Other Filters",
        "field": "attr:device_count",
        "requiresAttribute": "device_count"
      },
      {
        "label": "Device Model",
        "description": "Users by the model version of their mobile device",
        "group": "Other Filters",
        "field": "attr:device_model",
        "requiresAttribute": "device_model"
      },
      {
        "label": "Device OS",
        "description": "Users with a device on a specific operating system",
        "group": "Other Filters",
        "field": "attr:os",
        "requiresAttribute": "os"
      },
      {
        "label": "Device OS Version Number",
        "description": "Users with a device on a specific operating system version number",
        "group": "Other Filters",
        "field": "attr:os_version",
        "requiresAttribute": "os_version"
      },
      {
        "label": "Most Recent Device Locale",
        "description": "Users by the locale information from most recently used device",
        "group": "Other Filters",
        "field": "attr:device_locale",
        "requiresAttribute": "device_locale"
      },
      {
        "label": "Most Recent Watch Model",
        "description": "Users by their most recent smartwatch model",
        "group": "Other Filters",
        "field": "attr:watch_model",
        "requiresAttribute": "watch_model"
      },
      {
        "label": "Live Activity Push To Start Registered For App",
        "description": "Users registered for iOS live activity push to start for an app",
        "group": "Other Filters",
        "field": "attr:live_activity_push_to_start",
        "requiresAttribute": "live_activity_push_to_start"
      },
      {
        "label": "Provisionally Authorized on iOS",
        "description": "Users authorized on ios 12",
        "group": "Other Filters",
        "field": "attr:provisionally_authorized",
        "requiresAttribute": "provisionally_authorized"
      },
      {
        "label": "Web Browser",
        "description": "Web browser used to access your website",
        "group": "Other Filters",
        "field": "attr:web_browser",
        "requiresAttribute": "web_browser"
      }
    ]
  },
  {
    "name": "Location",
    "description": "User location data",
    "fields": [
      {
        "label": "Most Recent Location",
        "description": "Users by the last recorded location where they used your app",
        "unavailable": "This integration data is not connected to this workspace."
      },
      {
        "label": "Location Available",
        "description": "Users by whether they have reported their location",
        "field": "location_available"
      }
    ]
  },
  {
    "name": "Cohort membership",
    "description": "User membership in cohorts from Alloys integrations",
    "fields": [
      {
        "label": "Amplitude Cohorts",
        "description": "Users in an existing amplitude cohort",
        "unavailable": "This integration data is not connected to this workspace."
      },
      {
        "label": "AppsFlyer Cohorts",
        "description": "",
        "unavailable": "This integration data is not connected to this workspace."
      },
      {
        "label": "Census Cohorts",
        "description": "",
        "unavailable": "This integration data is not connected to this workspace."
      },
      {
        "label": "Heap Cohorts",
        "description": "",
        "unavailable": "This integration data is not connected to this workspace."
      },
      {
        "label": "Hightouch Cohorts",
        "description": "",
        "unavailable": "This integration data is not connected to this workspace."
      },
      {
        "label": "Kubit Cohorts",
        "description": "",
        "unavailable": "This integration data is not connected to this workspace."
      },
      {
        "label": "Mixpanel Cohorts",
        "description": "",
        "unavailable": "This integration data is not connected to this workspace."
      },
      {
        "label": "Segment Cohorts",
        "description": "",
        "unavailable": "This integration data is not connected to this workspace."
      },
      {
        "label": "Shopify Cohorts",
        "description": "",
        "unavailable": "This integration data is not connected to this workspace."
      },
      {
        "label": "Tinyclues Cohorts",
        "description": "",
        "unavailable": "This integration data is not connected to this workspace."
      },
      {
        "label": "Treasure Data Cohorts",
        "description": "",
        "unavailable": "This integration data is not connected to this workspace."
      }
    ]
  },
  {
    "name": "Install attribution",
    "description": "App uninstall behavior and date",
    "fields": [
      {
        "label": "Install Attribution Ad",
        "description": "Users by the ad their install was attributed to",
        "field": "attr:attribution_ad",
        "requiresAttribute": "attribution_ad"
      },
      {
        "label": "Install Attribution Adgroup",
        "description": "Users by the ad group their install was attributed to",
        "field": "attr:attribution_adgroup",
        "requiresAttribute": "attribution_adgroup"
      },
      {
        "label": "Install Attribution Campaign",
        "description": "Users by the ad campaign their install was attributed to",
        "field": "attr:attribution_campaign",
        "requiresAttribute": "attribution_campaign"
      },
      {
        "label": "Install Attribution Source",
        "description": "Users by the source their install was attributed to",
        "field": "attr:attribution_source",
        "requiresAttribute": "attribution_source"
      }
    ]
  },
  {
    "name": "Intelligence and Predictive",
    "description": "App uninstall behavior and date",
    "fields": [
      {
        "label": "Intelligent Channel",
        "description": "Users by their most active channel in the last 6 months",
        "unavailable": "This integration data is not connected to this workspace."
      },
      {
        "label": "Message Open Likelihood",
        "description": "Filter users by their likelihood to open messages on a specific channel",
        "unavailable": "This integration data is not connected to this workspace."
      }
    ]
  },
  {
    "name": "Social activity",
    "description": "Connection to Facebook and Twitter",
    "fields": [
      {
        "label": "Number of Facebook Friends Using App",
        "description": "",
        "field": "attr:facebook_friends_count",
        "requiresAttribute": "facebook_friends_count"
      },
      {
        "label": "Connected Facebook",
        "description": "",
        "field": "attr:connected_facebook",
        "requiresAttribute": "connected_facebook"
      },
      {
        "label": "Connected Twitter",
        "description": "",
        "field": "attr:connected_twitter",
        "requiresAttribute": "connected_twitter"
      },
      {
        "label": "Number of Twitter Followers",
        "description": "",
        "field": "attr:twitter_followers_count",
        "requiresAttribute": "twitter_followers_count"
      }
    ]
  },
  {
    "name": "eCommerce",
    "description": "eCommerce behavioral data",
    "fields": [
      {
        "label": "Total orders count",
        "description": "Total number of orders a user placed",
        "field": "ecommerce_order_count"
      },
      {
        "label": "Total refund value",
        "description": "Total value of refunds granted to a user",
        "field": "ecommerce_refund_total"
      },
      {
        "label": "Total revenue",
        "description": "Total revenue generated from the user’s orders",
        "field": "ecommerce_revenue"
      }
    ]
  }
];
export const otherAudienceFilters:CampaignFilterChoice[] = [
  {
    "label": "Email Address",
    "description": "Individual email addresses for testing",
    "field": "email"
  },
  {
    "label": "External User ID",
    "description": "Campaign recipients by user ids for testing",
    "field": "id"
  },
  {
    "label": "Random Bucket #",
    "description": "Users within a range of random bucket numbers",
    "field": "random_bucket"
  },
  {
    "label": "Created At",
    "description": "When the user record was created in Braze",
    "field": "created_at"
  },
  {
    "label": "Created From",
    "description": "Source of the user record created in Braze",
    "field": "created_from"
  },
  {
    "label": "Pending Deletion",
    "description": "Users that are marked for deletion",
    "field": "pending_deletion"
  }
];
