import { createClient } from "npm:@supabase/supabase-js@2.45.0";

type Json = Record<string, any>;
const PROJECT_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  || (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; } })();
const APP_ORIGIN = "https://quorlyth.vercel.app";
const admin = createClient(PROJECT_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function redirect(returnTo: string, values: Record<string, string>) {
  const url = new URL(returnTo || APP_ORIGIN + "/settings?tab=social");
  for (const [key,value] of Object.entries(values)) url.searchParams.set(key,value);
  return Response.redirect(url.toString(),303);
}
function basicAuth(clientId: string, clientSecret: string) { return "Basic " + btoa(clientId + ":" + clientSecret); }
function expiry(seconds: unknown) {
  const value=Number(seconds);
  return Number.isFinite(value)&&value>0?new Date(Date.now()+value*1000).toISOString():null;
}
async function saveConnection(input: Json) {
  const { error } = await admin.rpc("upsert_social_connection", {
    p_user_id: input.userId,
    p_provider: input.provider,
    p_provider_account_id: input.accountId,
    p_account_name: input.accountName || "",
    p_username: input.username || "",
    p_access_token: input.accessToken,
    p_refresh_token: input.refreshToken || null,
    p_token_expires_at: input.expiresAt || null,
    p_refresh_token_expires_at: input.refreshExpiresAt || null,
    p_scopes: input.scopes || [],
    p_metadata: input.metadata || {},
  });
  if (error) throw new Error("The social account was authorized, but its encrypted connection could not be saved.");
}
async function getConfig(provider: string) {
  const { data, error } = await admin.rpc("get_social_oauth_provider_config", { p_provider: provider });
  if (error) throw new Error("The provider app configuration could not be loaded.");
  const row=Array.isArray(data)?data[0]:data;
  if(!row?.client_id||!row?.client_secret) throw new Error("The provider app is no longer configured.");
  return {clientId:String(row.client_id),clientSecret:String(row.client_secret)};
}
async function exchange(provider: string, code: string, callback: string, state: Json) {
  const config=await getConfig(provider);
  let response: Response;
  if(provider==="x") {
    const body=new URLSearchParams({
      grant_type:"authorization_code",
      code,
      redirect_uri:callback,
      code_verifier:String(state.pkce_verifier||""),
      client_id:config.clientId,
    });
    response=await fetch("https://api.x.com/2/oauth2/token",{
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded",Authorization:basicAuth(config.clientId,config.clientSecret)},
      body,
    });
  } else if(provider==="linkedin") {
    const body=new URLSearchParams({
      grant_type:"authorization_code",code,redirect_uri:callback,
      client_id:config.clientId,client_secret:config.clientSecret,
    });
    response=await fetch("https://www.linkedin.com/oauth/v2/accessToken",{
      method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body,
    });
  } else if(provider==="meta") {
    const url=new URL("https://graph.facebook.com/v26.0/oauth/access_token");
    url.searchParams.set("client_id",config.clientId);
    url.searchParams.set("client_secret",config.clientSecret);
    url.searchParams.set("redirect_uri",callback);
    url.searchParams.set("code",code);
    response=await fetch(url.toString());
  } else if(provider==="pinterest") {
    const body=new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:callback});
    response=await fetch("https://api.pinterest.com/v5/oauth/token",{
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded",Authorization:basicAuth(config.clientId,config.clientSecret)},
      body,
    });
  } else {
    throw new Error("Unsupported social provider.");
  }
  const token=await response.json().catch(()=>({}));
  if(!response.ok||!token.access_token) {
    const detail=String(token.error_description||token.message||token.error||"");
    throw new Error(detail.slice(0,260)||("The "+provider+" authorization code could not be exchanged."));
  }
  if(provider==="meta") {
    const longUrl=new URL("https://graph.facebook.com/v26.0/oauth/access_token");
    longUrl.searchParams.set("grant_type","fb_exchange_token");
    longUrl.searchParams.set("client_id",config.clientId);
    longUrl.searchParams.set("client_secret",config.clientSecret);
    longUrl.searchParams.set("fb_exchange_token",token.access_token);
    const longResponse=await fetch(longUrl.toString());
    const longToken=await longResponse.json().catch(()=>({}));
    if(longResponse.ok&&longToken.access_token) {
      token.access_token=longToken.access_token;
      token.expires_in=longToken.expires_in||token.expires_in;
    }
  }
  return token as Json;
}
async function connectX(userId:string,token:Json) {
  const response=await fetch("https://api.x.com/2/users/me?user.fields=name,username,profile_image_url",{
    headers:{Authorization:"Bearer "+token.access_token},
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.data?.id) throw new Error("X authorized the app, but the account profile could not be loaded.");
  const account=payload.data;
  await saveConnection({
    userId,provider:"x",accountId:account.id,accountName:account.name||account.username,username:account.username,
    accessToken:token.access_token,refreshToken:token.refresh_token,
    expiresAt:expiry(token.expires_in),refreshExpiresAt:expiry(token.refresh_token_expires_in),
    scopes:String(token.scope||"").split(" ").filter(Boolean),
    metadata:{profileImageUrl:account.profile_image_url||""},
  });
}
async function connectLinkedIn(userId:string,token:Json) {
  const response=await fetch("https://api.linkedin.com/v2/userinfo",{
    headers:{Authorization:"Bearer "+token.access_token},
  });
  const account=await response.json().catch(()=>({}));
  if(!response.ok||!account.sub) throw new Error("LinkedIn authorized the app, but its profile could not be loaded.");
  await saveConnection({
    userId,provider:"linkedin",accountId:account.sub,accountName:account.name||"LinkedIn member",
    username:account.email||"",
    accessToken:token.access_token,refreshToken:token.refresh_token,
    expiresAt:expiry(token.expires_in),refreshExpiresAt:expiry(token.refresh_token_expires_in),
    scopes:String(token.scope||"").split(" ").filter(Boolean),
    metadata:{authorUrn:"urn:li:person:"+account.sub,profileImageUrl:account.picture||""},
  });
}
async function connectMeta(userId:string,token:Json) {
  const userUrl=new URL("https://graph.facebook.com/v26.0/me");
  userUrl.searchParams.set("fields","id,name");
  userUrl.searchParams.set("access_token",token.access_token);
  const userResponse=await fetch(userUrl.toString());
  const user=await userResponse.json().catch(()=>({}));
  if(!userResponse.ok||!user.id) throw new Error(user?.error?.message||"Meta could not verify the authorized account.");
  const pagesUrl=new URL("https://graph.facebook.com/v26.0/me/accounts");
  pagesUrl.searchParams.set("fields","id,name,access_token,instagram_business_account{id,username}");
  pagesUrl.searchParams.set("limit","100");
  pagesUrl.searchParams.set("access_token",token.access_token);
  const pagesResponse=await fetch(pagesUrl.toString());
  const pages=await pagesResponse.json().catch(()=>({}));
  if(!pagesResponse.ok||!Array.isArray(pages.data)) throw new Error(pages?.error?.message||"Meta could not load your Facebook Pages.");
  if(!pages.data.length) throw new Error("Connect at least one Facebook Page to the Meta app, then try again.");
  let saved=0;
  for(const page of pages.data.slice(0,50)) {
    if(!page.id||!page.access_token) continue;
    await saveConnection({
      userId,provider:"facebook",accountId:String(page.id),accountName:String(page.name||"Facebook Page"),
      username:"",accessToken:page.access_token,refreshToken:null,expiresAt:null,refreshExpiresAt:null,
      scopes:String(token.scope||"").split(",").filter(Boolean),
      metadata:{pageId:String(page.id),pageName:String(page.name||"")},
    });
    saved++;
    const ig=page.instagram_business_account;
    if(ig?.id) {
      await saveConnection({
        userId,provider:"instagram",accountId:String(ig.id),accountName:String(ig.username||page.name||"Instagram professional account"),
        username:String(ig.username||""),accessToken:page.access_token,refreshToken:null,expiresAt:null,refreshExpiresAt:null,
        scopes:String(token.scope||"").split(",").filter(Boolean),
        metadata:{pageId:String(page.id),pageName:String(page.name||""),username:String(ig.username||"")},
      });
      saved++;
    }
  }
  if(!saved) throw new Error("Meta returned no publishable Page or professional Instagram account.");
}
async function connectPinterest(userId:string,token:Json) {
  const response=await fetch("https://api.pinterest.com/v5/user_account",{
    headers:{Authorization:"Bearer "+token.access_token},
  });
  const account=await response.json().catch(()=>({}));
  if(!response.ok||!account.username) throw new Error(account?.message||"Pinterest authorized the app, but the account could not be loaded.");
  const boardsResponse=await fetch("https://api.pinterest.com/v5/boards?page_size=100",{
    headers:{Authorization:"Bearer "+token.access_token},
  });
  const boardPayload=await boardsResponse.json().catch(()=>({}));
  const boards=Array.isArray(boardPayload.items)?boardPayload.items.slice(0,100).map((board:Json)=>({
    id:String(board.id),name:String(board.name||"Board"),privacy:String(board.privacy||"PUBLIC"),
  })):[];
  await saveConnection({
    userId,provider:"pinterest",accountId:String(account.username),accountName:String(account.business_name||account.username),
    username:String(account.username),accessToken:token.access_token,refreshToken:token.refresh_token,
    expiresAt:expiry(token.expires_in),refreshExpiresAt:expiry(token.refresh_token_expires_in),
    scopes:String(token.scope||"").split(",").filter(Boolean),
    metadata:{boards,defaultBoardId:boards[0]?.id||"",profileImageUrl:account.profile_image||""},
  });
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="GET") return new Response("Method not allowed",{status:405});
  if(!PROJECT_URL||!SERVICE_KEY) return new Response("Social OAuth callback is not configured.",{status:500});
  const url=new URL(req.url);
  const code=url.searchParams.get("code")||"";
  const stateValue=url.searchParams.get("state")||"";
  const providerError=url.searchParams.get("error_description")||url.searchParams.get("error")||"";
  if(!stateValue||stateValue.length>256) return new Response("Invalid OAuth state.",{status:400});
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(stateValue)));
  const stateHash=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
  const {data:states,error:stateError}=await admin.rpc("consume_social_oauth_state",{p_state_hash:stateHash});
  const state=Array.isArray(states)?states[0]:states;
  if(stateError||!state?.user_id||!state?.provider) return new Response("This social authorization link expired or was already used. Return to Quorlyth and try again.",{status:400});
  const returnTo=String(state.return_to||APP_ORIGIN+"/settings?tab=social");
  const provider=String(state.provider);
  if(providerError) return redirect(returnTo,{oauth:"error",provider,message:"Authorization was cancelled or denied by the provider."});
  if(!code) return redirect(returnTo,{oauth:"error",provider,message:"The provider did not return an authorization code."});

  try {
    const callback=PROJECT_URL.replace(/\/+$/g,"")+"/functions/v1/social-oauth-callback";
    const token=await exchange(provider,code,callback,state);
    if(provider==="x") await connectX(state.user_id,token);
    else if(provider==="linkedin") await connectLinkedIn(state.user_id,token);
    else if(provider==="meta") await connectMeta(state.user_id,token);
    else if(provider==="pinterest") await connectPinterest(state.user_id,token);
    return redirect(returnTo,{oauth:"connected",provider});
  } catch(error) {
    const message=error instanceof Error?error.message.slice(0,220):"Could not complete social account authorization.";
    console.error("Social OAuth callback failed:",provider,message);
    return redirect(returnTo,{oauth:"error",provider,message});
  }
});
