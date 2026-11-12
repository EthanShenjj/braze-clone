/** Labels and order verified in source-27-tag-interaction.ax.txt (2026-11-11).
 * Event/channel identifiers describe this workspace's normalized message event contract. */
export type TaggedInteraction = {id:string;label:string;event:string;channel:string;button?:1|2;machine?:boolean;selector?:"button"|"page"};
export const taggedInteractions:TaggedInteraction[] = [
  {id:"clicked_banner",label:"clicked banner",event:"clicked",channel:"banner"},
  {id:"clicked_content_card",label:"clicked content card",event:"clicked",channel:"content"},
  {id:"clicked_email",label:"clicked email",event:"clicked",channel:"email"},
  {id:"clicked_iam",label:"clicked in-app message",event:"clicked",channel:"iam"},
  {id:"clicked_iam_button_1",label:"clicked in-app message button 1",event:"clicked",channel:"iam",button:1},
  {id:"clicked_iam_button_2",label:"clicked in-app message button 2",event:"clicked",channel:"iam",button:2},
  {id:"clicked_sms_link",label:"clicked shortened sms link",event:"clicked",channel:"sms"},
  {id:"clicked_kakaotalk_link",label:"clicked tracked KakaoTalk link",event:"clicked",channel:"kakaotalk"},
  {id:"clicked_line_link",label:"clicked tracked LINE link",event:"clicked",channel:"line"},
  {id:"clicked_whatsapp_link",label:"clicked tracked WhatsApp link",event:"clicked",channel:"whatsapp"},
  {id:"opened_push",label:"directly opened push notification",event:"opened",channel:"push"},
  {id:"dismissed_banner",label:"dismissed banner",event:"dismissed",channel:"banner"},
  {id:"dismissed_content_card",label:"dismissed content card",event:"dismissed",channel:"content"},
  {id:"opened_email",label:"opened email",event:"opened",channel:"email"},
  {id:"opened_email_machine",label:"opened email (machine opens)",event:"opened",channel:"email",machine:true},
  {id:"opened_email_other",label:"opened email (other opens)",event:"opened",channel:"email",machine:false},
  {id:"read_whatsapp",label:"read WhatsApp message",event:"opened",channel:"whatsapp"},
  {id:"replied_sms",label:"replied to sms",event:"replied",channel:"sms"},
  {id:"viewed_banner",label:"viewed banner",event:"impression",channel:"banner"},
  {id:"viewed_content_card",label:"viewed content card",event:"impression",channel:"content"},
  {id:"viewed_iam",label:"viewed in-app message",event:"impression",channel:"iam"},
];
export function findTagInteraction(id:unknown):TaggedInteraction|undefined {
  return typeof id==="string"?taggedInteractions.find(interaction=>interaction.id===id):undefined;
}

/** Campaign source-15 adds two Push interaction types; tag filters retain their verified 21 choices. */
export const campaignInteractions:TaggedInteraction[] = [
 ...taggedInteractions.slice(0,6),
 {id:"clicked_push_button",label:"clicked push notification button",event:"clicked",channel:"push",selector:"button"},
 {id:"clicked_push_story_page",label:"clicked push story page",event:"clicked",channel:"push",selector:"page"},
 ...taggedInteractions.slice(6),
];
export function findCampaignInteraction(id:unknown):TaggedInteraction|undefined {
 return typeof id==="string"?campaignInteractions.find(interaction=>interaction.id===id):undefined;
}
