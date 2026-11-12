/** Catalog labels and descriptions verified against saved live Braze accessibility captures.
 * Resource IDs are selected in a condition editor; they are never filter types. */
export type CampaignFilterChoice={label:string;description?:string;field?:string;group?:string;children?:CampaignFilterChoice[]};
export type CampaignFilterCategory={name:string;description:string;fields:CampaignFilterChoice[]};
export const audienceFilterCatalog:CampaignFilterCategory[] = [
  {
    "name": "Segment or CSV membership",
    "description": "User membership in other segments, Segment Extension, or imported CSV",
    "fields": [
      {
        "label": "Segment Membership",
        "description": "Users that are included in an existing segment",
        "field": "membership:segment"
      },
      {
        "label": "Braze Segment Extensions",
        "description": "Include or exclude an existing segment extension",
        "field": "membership:extension"
      },
      {
        "label": "Updated/Imported from CSV",
        "description": "Users who were part of a csv upload",
        "field": "membership:csv"
      }
    ]
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
            "field": "session_app_count:"
          },
          {
            "label": "X Sessions in Last Y Days",
            "description": "Number of app sessions in the last 1-30 days",
            "field": "session_recent:7"
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
            "field": "session_app_first:"
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
            "field": "session_app_last:"
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
            "field": "receipt_count:delivered:"
          },
          {
            "label": "Received Campaign Variant",
            "description": "Campaign variant users received in an a/b test",
            "field": "receipt_variant::"
          },
          {
            "label": "Received Message from Canvas Step",
            "description": "Users who received a message from a specific Canvas step",
            "field": "canvas_receipt_count:delivered"
          },
          {
            "label": "Received Feature Flag Variant",
            "description": "Feature Flag experiment variant users received in an a/b test",
            "field": "feature_variant::"
          },
          {
            "label": "Last Received Message from Specific Canvas Step",
            "description": "When a user last received a specific campaign",
            "field": "canvas_receipt_last:delivered"
          },
          {
            "label": "Last Received Message from Specific Campaign",
            "description": "Last message received was from a specific campaign",
            "field": "receipt_last:delivered:"
          },
          {
            "label": "Received Message from Campaign or Canvas with Tag",
            "description": "Received any message with a specific tag",
            "field": "receipt_tag_count:delivered:"
          },
          {
            "label": "Last Received Message from Campaign or Canvas With Tag",
            "description": "Last message received was from a Campaign or Canvas with a specific tag",
            "field": "receipt_tag_last:delivered:"
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
            "field": "receipt_count:engaged:"
          },
          {
            "label": "Clicked/Opened Campaign or Canvas With Tag",
            "description": "Interaction with a specific campaign",
            "field": "receipt_tag_count:engaged:"
          },
          {
            "label": "Clicked/Opened Step",
            "description": "Interaction with a specific Canvas component",
            "field": "canvas_receipt_count:engaged"
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
            "field": "receipt_alias:"
          },
          {
            "label": "Clicked Alias in Canvas Step",
            "description": "",
            "field": "canvas_alias"
          },
          {
            "label": "Clicked Alias in any Campaign or Canvas Step",
            "description": "",
            "field": "receipt_alias_any:"
          },
          {
            "label": "Hard Bounced",
            "description": "Users with email addresses that have hard bounced",
            "field": "attr:email_hard_bounced"
          },
          {
            "label": "Has Marked You As Spam",
            "description": "Users who marked your messages as spam",
            "field": "attr:email_marked_spam"
          },
          {
            "label": "Soft Bounced",
            "description": "Users with email addresses that have soft bounced",
            "field": "attr:email_soft_bounced"
          }
        ]
      },
      {
        "label": "SMS",
        "description": "",
        "children": [
          {
            "label": "Invalid Phone Number",
            "description": "Users with an invalid phone number",
            "field": "attr:invalid_phone_number"
          },
          {
            "label": "Phone Number",
            "description": "Users by phone number, in E.164 format",
            "field": "attr:phone"
          },
          {
            "label": "Last Sent Specific Inbound Keyword Category",
            "description": "",
            "field": "inbound_sms_keyword_last"
          }
        ]
      },
      {
        "label": "Converted",
        "description": "",
        "children": [
          {
            "label": "Converted From Campaign",
            "description": "Users who performed a campaign conversion event",
            "field": "receipt_count:conversion:"
          },
          {
            "label": "Converted From Canvas",
            "description": "Users who performed a Canvas conversion event",
            "field": "canvas_receipt_count:conversion"
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
            "field": "receipt_count:control:"
          },
          {
            "label": "In Canvas Control Group",
            "description": "Users in the control group of a Canvas",
            "field": "canvas_receipt_count:control"
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
            "field": "feature_enabled:"
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
            "field": "survey_submitted:landing"
          },
          {
            "label": "Submitted Survey in Campaign",
            "description": "Users who last submitted a survey in a specific campaign",
            "field": "survey_submitted:campaign"
          },
          {
            "label": "Submitted Survey in Canvas Step",
            "description": "Users who last submitted a survey in a specific canvas step",
            "field": "survey_submitted:canvas"
          }
        ]
      },
      {
        "label": "Entered Canvas Variation",
        "description": "Users by whether they have entered a variation path of a specific canvas",
        "group": "Other Filters",
        "field": "canvas_entered"
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
        "field": "landing_form"
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
            "field": "attr:email_opt_in_date"
          },
          {
            "label": "Email Subscription Status",
            "description": "Users by their subscription status for email",
            "field": "emailSubscriptionStatus"
          },
          {
            "label": "Email Unsubscribed Date",
            "description": "Users by the date on which they unsubscribed from future emails",
            "field": "attr:email_unsubscribed_date"
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
            "field": "attr:foreground_push_enabled"
          },
          {
            "label": "Foreground Push Enabled for App",
            "description": "Users who are foreground push enabled for an app. This does not take push subscription status into account.",
            "field": "push_app_enabled"
          },
          {
            "label": "Background or Foreground Push Enabled",
            "description": "Users who are background or foreground push enabled for any of your apps",
            "field": "attr:push_enabled"
          },
          {
            "label": "Push Opt In Date",
            "description": "Date users opted-in for push",
            "field": "attr:push_opt_in_date"
          },
          {
            "label": "Push Subscription Status",
            "description": "Subscription status for push notifications",
            "field": "attr:push_subscription_status"
          },
          {
            "label": "Push Unsubscribed Date",
            "description": "Date users unsubscribed from push notifications",
            "field": "attr:push_unsubscribed_date"
          }
        ]
      },
      {
        "label": "Subscription Group",
        "description": "Users by subscription group for channels that require opt-in",
        "group": "Other Filters",
        "field": "subscription_group:"
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
        "field": "attr:shopify_market"
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
        "field": "attr:app_id"
      },
      {
        "label": "Most Recent App Version Name",
        "description": "Most recent name of the user's app",
        "field": "attr:app_version_name"
      },
      {
        "label": "Most Recent App Version Number",
        "description": "Most recent version number of a user's app",
        "field": "attr:app_version"
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
        "field": "attr:uninstalled"
      },
      {
        "label": "Uninstall Date",
        "description": "Date users uninstalled your app",
        "field": "attr:uninstall_date"
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
            "field": "attr:idfa"
          },
          {
            "label": "Device IDFV",
            "description": "Users by identifier for vendor for testing",
            "field": "attr:idfv"
          },
          {
            "label": "Device Google Ad ID",
            "description": "Users by Google advertising identifier for testing",
            "field": "attr:google_ad_id"
          },
          {
            "label": "Device Roku Ad ID",
            "description": "",
            "field": "attr:roku_ad_id"
          },
          {
            "label": "Device Windows Ad ID",
            "description": "",
            "field": "attr:windows_ad_id"
          },
          {
            "label": "Ad Tracking Enabled",
            "description": "Users opted-in to ad tracking on ios",
            "field": "attr:ad_tracking_enabled"
          }
        ]
      },
      {
        "label": "Device Carrier",
        "description": "Users by device carrier",
        "group": "Other Filters",
        "field": "attr:device_carrier"
      },
      {
        "label": "Device Count",
        "description": "How many devices users have used your app on",
        "group": "Other Filters",
        "field": "attr:device_count"
      },
      {
        "label": "Device Model",
        "description": "Users by the model version of their mobile device",
        "group": "Other Filters",
        "field": "attr:device_model"
      },
      {
        "label": "Device OS",
        "description": "Users with a device on a specific operating system",
        "group": "Other Filters",
        "field": "attr:os"
      },
      {
        "label": "Device OS Version Number",
        "description": "Users with a device on a specific operating system version number",
        "group": "Other Filters",
        "field": "attr:os_version"
      },
      {
        "label": "Most Recent Device Locale",
        "description": "Users by the locale information from most recently used device",
        "group": "Other Filters",
        "field": "attr:device_locale"
      },
      {
        "label": "Most Recent Watch Model",
        "description": "Users by their most recent smartwatch model",
        "group": "Other Filters",
        "field": "attr:watch_model"
      },
      {
        "label": "Live Activity Push To Start Registered For App",
        "description": "Users registered for iOS live activity push to start for an app",
        "group": "Other Filters",
        "field": "attr:live_activity_push_to_start"
      },
      {
        "label": "Provisionally Authorized on iOS",
        "description": "Users authorized on ios 12",
        "group": "Other Filters",
        "field": "attr:provisionally_authorized"
      },
      {
        "label": "Web Browser",
        "description": "Web browser used to access your website",
        "group": "Other Filters",
        "field": "attr:web_browser"
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
        "field": "location_recent"
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
        "label": "Decisioning Studio Agent",
        "description": "Users added directly to a Decisioning Studio agent's audience",
        "field": "cohort:decisioning_studio_agent"
      },
      {
        "label": "Amplitude Cohorts",
        "description": "Users in an existing amplitude cohort",
        "field": "cohort:amplitude"
      },
      {
        "label": "AppsFlyer Cohorts",
        "description": "",
        "field": "cohort:appsflyer"
      },
      {
        "label": "Census Cohorts",
        "description": "",
        "field": "cohort:census"
      },
      {
        "label": "Heap Cohorts",
        "description": "",
        "field": "cohort:heap"
      },
      {
        "label": "Hightouch Cohorts",
        "description": "",
        "field": "cohort:hightouch"
      },
      {
        "label": "Kubit Cohorts",
        "description": "",
        "field": "cohort:kubit"
      },
      {
        "label": "Mixpanel Cohorts",
        "description": "",
        "field": "cohort:mixpanel"
      },
      {
        "label": "Segment Cohorts",
        "description": "",
        "field": "cohort:segment"
      },
      {
        "label": "Shopify Cohorts",
        "description": "",
        "field": "cohort:shopify"
      },
      {
        "label": "Tinyclues Cohorts",
        "description": "",
        "field": "cohort:tinyclues"
      },
      {
        "label": "Treasure Data Cohorts",
        "description": "",
        "field": "cohort:treasure_data"
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
        "field": "attr:attribution_ad"
      },
      {
        "label": "Install Attribution Adgroup",
        "description": "Users by the ad group their install was attributed to",
        "field": "attr:attribution_adgroup"
      },
      {
        "label": "Install Attribution Campaign",
        "description": "Users by the ad campaign their install was attributed to",
        "field": "attr:attribution_campaign"
      },
      {
        "label": "Install Attribution Source",
        "description": "Users by the source their install was attributed to",
        "field": "attr:attribution_source"
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
        "field": "intelligent_channel"
      },
      {
        "label": "Message Open Likelihood",
        "description": "Filter users by their likelihood to open messages on a specific channel",
        "field": "message_open_likelihood"
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
        "field": "attr:facebook_friends_count"
      },
      {
        "label": "Connected Facebook",
        "description": "",
        "field": "attr:connected_facebook"
      },
      {
        "label": "Connected Twitter",
        "description": "",
        "field": "attr:connected_twitter"
      },
      {
        "label": "Number of Twitter Followers",
        "description": "",
        "field": "attr:twitter_followers_count"
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
