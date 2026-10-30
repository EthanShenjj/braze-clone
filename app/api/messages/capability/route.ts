import { messageDeliveryCapability } from "@/lib/message-delivery";
export const runtime="nodejs";
export function GET(){return Response.json({channels:["email","sms","line","whatsapp","push","iam","banner","content"].map(messageDeliveryCapability)});}
