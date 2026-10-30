import catalog from "./in-app-template-catalog.json" with {type:"json"};
import sourcePages from "./in-app-source-pages.json" with {type:"json"};
import { defaultGlobal, type InAppPage, type InAppGlobalStyle, type InAppVariant } from "./in-app-model.ts";

export type InAppTemplate = { id: string; name: string; description: string; pages?: InAppPage[]; global?: InAppGlobalStyle; variant?: InAppVariant; tags?: string[]; updatedAt?: string };
const capturedPages = sourcePages as InAppPage[];
const page = (id: string, title: string, body: string, buttonText: string, kind?: "Email Capture" | "Phone Capture", behavior: "dismiss" | "request_push" = "dismiss"): InAppPage => ({
  id, name:title || "Blank",title,body,buttonText,imageUrl:"",columns:1,
  buttons:[{id:`${id}_button`,text:buttonText,behavior,href:"",style:"primary"}],
  extraBlocks:kind?[{id:`${id}_capture`,kind,text:kind === "Email Capture" ? "Email address" : "Phone number",mapTo:kind === "Email Capture" ? "email" : "phone"}]:[],
});
const additionalPages: Record<string, InAppPage[]> = {
  "Email sign-up with special offer":[page("special_offer","A little something for you","Sign up for emails and enjoy 15% off your next order.","Get my offer","Email Capture")],
  "Email sign-up with welcome discount":[page("welcome_discount","Welcome to the club","Join our email list and take 20% off your first order.","Sign me up","Email Capture")],
  "Product announcement":[{...page("product_announcement","Meet your new favorite","Explore our latest release and discover what’s new.","Explore now"),imageUrl:"/braze-iam/onboarding-2.png"}],
  "Push primer":[page("push_primer","Stay in the know","Enable notifications for important updates, timely reminders, and offers made for you.","Enable notifications",undefined,"request_push")],
  "Seasonal promo with background image":[page("seasonal_promo","A season of something special","Discover limited-time offers selected for you.","Shop the collection")],
  "Background image":[page("background_image","Make a lasting impression","Add your background image and tell your story.","Learn more")],
  "Email sign-up":[page("email_signup","Let’s keep in touch","Get the latest updates and exclusive offers in your inbox.","Subscribe","Email Capture")],
  "SMS sign-up":[page("sms_signup","Never miss a moment","Sign up for text updates. Message and data rates may apply. Reply STOP to unsubscribe.","Sign up for texts","Phone Capture")],
  "WhatsApp sign-up":[page("whatsapp_signup","Let’s connect on WhatsApp","Get helpful updates and offers on WhatsApp. You can unsubscribe at any time.","Sign up for WhatsApp","Phone Capture")],
};
export const inAppTemplates: InAppTemplate[] = catalog.map(template => ({
  ...template,
  pages: template.name === "Onboarding flow" ? capturedPages.slice(0, 5) : template.name === "Basic" ? [capturedPages[5]] : template.name === "Email sign-up with background image" ? [capturedPages[6]] : template.name === "Email sign-up with confirmation page" ? capturedPages.slice(7, 9) : template.name === "Blank" ? [{ ...capturedPages[5], id: "blank", name: "Blank", title: "", body: "", buttons: [], extraBlocks: [], imageUrl: "" }] : additionalPages[template.name],
  global: { ...defaultGlobal,...(["Background image","Seasonal promo with background image"].includes(template.name)?{backgroundImageEnabled:true,backgroundImageUrl:"/braze-iam/onboarding-2.png",backgroundColor:"#24212c",textColor:"#ffffff",buttonColor:"#ffffff",buttonTextColor:"#24212c"}:{}) },
}));
