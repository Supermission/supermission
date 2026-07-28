import crypto from "crypto";

let goPlusAccessToken: string | null = null;
let goPlusAccessTokenExpiresAt: number | null = null;

export async function getGoPlusAccessToken(): Promise<string> {
    const appKey = process.env.GO_PLUS_APP_KEY;
    const appSecret = process.env.GO_PLUS_APP_SECRET;

    if (!appKey || !appSecret){
        throw new Error(
            "Missing Go Plus Credentials in the ENV"
        )
    }

    const now = Date.now();

    if (
        goPlusAccessToken &&
        goPlusAccessTokenExpiresAt &&
        now < goPlusAccessTokenExpiresAt - (1000 * 60 * 60 * 2)
    ){
        return goPlusAccessToken
    }

    const timeSec = Math.floor(now / 1000);
    const signPayload = `${appKey}${timeSec}${appSecret}`;
    const sign = crypto.createHash("sha1").update(signPayload).digest("hex");

    const body = {
        app_key: appKey,
        sign,
        time: timeSec
    };


    const tokenUrl = `https://api.gopluslabs.io/api/v1/token`;

    const res = await fetch(tokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!res.ok){
        console.error(
            "[getGoPlusTokenError] Error response from go plus access token",
            res.status
        )
        throw new Error(`Failed to fetch GoPlus Access Token: ${res.status}`);
    }

    let json: any;

    try {
        json = await res.json();
    } catch (error){
        console.error("[getGoPlusTokenError] Failed to parse token response", error); // Before throwing JSON parse error
        throw new Error("Failed to parse GoPlus access token response");
    }

    if (!json.result.access_token){
        console.error("[getGoPlusAccessToken] Unexpected token response", json); // Before throwing invalid response error
        throw new Error("Invalid GoPlus token response");
    }

    const accessToken: string = json.result.access_token;
    const expiresInSec: number = Number(json.result.expires_in ?? 0);

    goPlusAccessToken = accessToken;

    goPlusAccessTokenExpiresAt = now + expiresInSec * 1000;
    return accessToken
}