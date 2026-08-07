import { google, youtube_v3 } from "googleapis";
import { database, NAMESPACE_VIDEO_CONTENT_DETAILS, NAMESPACE_VIDEO_SNIPPET } from "./db.js";

async function downloadContentDetails(youtube: youtube_v3.Youtube, ids: string[]) {
    const BATCH_SIZE = 50;
    console.log(`\n[DEBUG] Starting contentDetails download for ${ids.length} videos...`);
    
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        console.log(`[DEBUG] Fetching contentDetails batch ${i / BATCH_SIZE + 1} (${batch.length} IDs)`);
        
        const videoData = await youtube.videos.list({
            id: batch,
            part: ['contentDetails']
        });
        
        videoData.data?.items?.forEach((item: any) => {
            if (item.id) {
                database.save(NAMESPACE_VIDEO_CONTENT_DETAILS, item.id, {
                    duration: item.contentDetails?.duration
                });
            }
        });
    }
    console.log(`[DEBUG] Content details successfully saved.`);
}

export async function loadNewMovies(): Promise<string[]> {
    console.log("=========================================");
    console.log("Starting downloading new movies");
    console.log("=========================================");

    const youtube = google.youtube({
        version: 'v3',
        auth: process.env.YOUTUBE_API_KEY
    });

    console.log("[DEBUG] Fetching channel details for ID: UC-CFLy8KSKEVFhwj3R4wOwA");

    const channelContentDetails = await youtube.channels.list({
        id: ['UC-CFLy8KSKEVFhwj3R4wOwA'],
        part: ['contentDetails']
    });

    const uploadPlaylistId = channelContentDetails
        ?.data
        ?.items
        ?.find(value => value?.contentDetails?.relatedPlaylists?.uploads)
        ?.contentDetails
        ?.relatedPlaylists
        ?.uploads;

    if (!uploadPlaylistId) {
        console.error("[ERROR] Could not resolve uploadPlaylistId from YouTube response!");
        console.error("[DEBUG] Channel Response:", JSON.stringify(channelContentDetails.data, null, 2));
        throw new Error("uploadPlaylistId is missing");
    }

    console.log(`[DEBUG] Upload Playlist ID resolved: ${uploadPlaylistId}`);

    let pageToken: string | undefined = undefined;
    let pageCount = 0;
    let totalItemsExamined = 0;
    const downloadedVideosIds: string[] = [];

    do {
        pageCount++;
        console.log(`\n--- [DEBUG] Fetching Playlist Page #${pageCount} (Token: ${pageToken || 'FIRST_PAGE'}) ---`);

        const playlistItemsResponse: any = await youtube.playlistItems.list({
            playlistId: uploadPlaylistId,
            maxResults: 50,
            part: ['snippet'],
            pageToken: pageToken
        });

        const items = playlistItemsResponse.data?.items || [];
        console.log(`[DEBUG] Page #${pageCount} returned ${items.length} items.`);

        if (items.length === 0) {
            console.warn(`[WARN] Page #${pageCount} returned 0 items even though API call succeeded.`);
        }

        const now = new Date().toISOString();

        for (const playlistItem of items) {
            totalItemsExamined++;
            const videoId = playlistItem?.snippet?.resourceId?.videoId;
            const title = playlistItem?.snippet?.title || "Unknown Title";

            if (!videoId) {
                console.warn(`[WARN] Item #${totalItemsExamined} missing videoId (Title: "${title}"). Skipping.`);
                continue;
            }

            // Check database status
            const existingRecord = database.read(NAMESPACE_VIDEO_SNIPPET, videoId);

            if (existingRecord) {
                console.log(`[DEBUG] [SKIP] Video already in DB: [${videoId}] "${title}"`);
                continue; 
            }

            console.log(`[DEBUG] [SAVE] New video found: [${videoId}] "${title}"`);

            const toSave = {
                schemaVersion: 1,
                retrievedAt: now,
                publishedAt: playlistItem.snippet?.publishedAt,
                title: title,
                description: playlistItem.snippet?.description,
                thumbnail: playlistItem.snippet?.thumbnails,
                videoId: videoId
            };

            database.save(NAMESPACE_VIDEO_SNIPPET, videoId, toSave);
            downloadedVideosIds.push(videoId);
        }

        pageToken = playlistItemsResponse.data?.nextPageToken;
        console.log(`[DEBUG] Next Page Token for loop: ${pageToken || 'NONE (Reached End)'}`);

    } while (pageToken);

    console.log("\n=========================================");
    console.log(`[SUMMARY] Total Pages Fetched: ${pageCount}`);
    console.log(`[SUMMARY] Total Items Examined: ${totalItemsExamined}`);
    console.log(`[SUMMARY] Total New Videos Saved: ${downloadedVideosIds.length}`);
    console.log("=========================================");

    if (downloadedVideosIds.length > 0) {
        await downloadContentDetails(youtube, downloadedVideosIds);
    }

    return downloadedVideosIds;
}
