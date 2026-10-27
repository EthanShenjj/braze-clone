# Public reference follow-up (2026-10-27)

The original dashboard template interaction was denied by browser security policy. It has not been retried or accessed through another browser, authenticated API, CDP, or shell. Work uses official public documentation only.

## Traditional editor evidence
- https://www.braze.com/docs/user_guide/channels/in_app_messages/traditional
- https://www.braze.com/docs/assets/img_archive/iam_compose.png (saved as official-traditional-compose.png)
- https://www.braze.com/docs/user_guide/channels/in_app_messages/message_types/email_capture_form
- https://www.braze.com/docs/assets/img/email_capture.png (saved as official-email-capture.png)
- https://www.braze.com/docs/user_guide/channels/in_app_messages/message_types/slideup

Grounding: preview left / Compose, Design, Settings, Test right; image URL/upload, language, header/body, two buttons, message close, orientation/device targeting, color/opacity/alignment, email capture placeholder and terms. SDK actions can be configured and simulated locally; no real Braze SDK delivery is available.

## Remaining modern drag-and-drop templates
Nine templates still lack complete current dashboard source payloads. Official phone capture documentation provides SMS editing and subscription-group/country controls, but screenshots are not complete template DOM/CSS or the latest dashboard payload. Do not substitute archived custom HTML templates for current drag-and-drop templates or claim pixel equivalence.

- https://www.braze.com/docs/user_guide/messaging/templates/in_app_message_templates/phone_number_capture
- saved official-phone-editor.png, official-phone-examples.png

Traditional UI variants beyond the public screenshots, mobile source states, and nine complete modern templates remain unverified. Root design-qa.md stays blocked pending evidence.

## Additional official references found

Public template directory: https://www.braze.com/docs/user_guide/messaging/templates/in_app_message_templates

| Remaining template | Public evidence saved/found | Still missing for current 1:1 replication |
| --- | --- | --- |
| Email sign-up with special offer | email_offer guide; official-email_capture_offer.png | All follow-up page payloads, original image/logo assets, DOM/style state |
| Email sign-up with welcome discount | email_discount guide; official-email_capture_discount.png | Confirmation payload, original cosmetics image/logo, DOM/style state |
| Product announcement | product_announcement guide; official-product_announcement.png | Original illustration asset and complete DOM/style state |
| Push primer | Official push_primer_messages guide with SDK action behavior | Current built-in template payload and assets |
| Seasonal promo with background image | seasonal_promo guide; official-seasonal_promo.png and official-seasonal_promo_image.png | Full original background asset URL and DOM/style state |
| Background image | official-phone-picker.png shows thumbnail/name/buttons | Current full page payload, styles, background configuration |
| Email sign-up | email_capture guide; official-email_capture_template1.png | Full page payload, disclaimer, DOM/style state |
| SMS sign-up | phone_number_capture guide; official-phone-editor.png | Full current payload, disclaimer/field configuration and DOM/style state |
| WhatsApp sign-up | phone_number_capture guide; official-phone-picker.png | Full current payload, disclaimer/field configuration and DOM/style state |

Guide URL suffixes above are under the official template directory. Push guide: https://www.braze.com/docs/user_guide/channels/push/best_practices/push_primer_messages . Public screenshots have been downloaded through their actual linked URLs; no authenticated dashboard data or internal APIs were fetched.

The nine modern template availability flags remain unchanged. Public screenshots are evidence for subsequent implementation, not substitutes for complete editable template snapshots. No archived legacy HTML has been relabeled as a modern drag-and-drop template.
