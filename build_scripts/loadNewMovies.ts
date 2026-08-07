import fs from "fs";
import path from "path";
import { google, youtube_v3 } from "googleapis";
import { database, NAMESPACE_VIDEO_CONTENT_DETAILS, NAMESPACE_VIDEO_SNIPPET } from "./db.js";

// Adjust path depending on where your local DB JSON files are stored
const DB_DIR = path.resolve("./database"); 

function videoFileExists(namespace: string, id: string): boolean {
    const expectedPath = path.join(DB_DIR, namespace, `${id}.json`);
    return fs.existsSync(expectedPath);
}

async function downloadContentDetails(youtube: youtube_v3.Youtube, ids: string[]) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const videoData = await youtube.videos.list({
            id: batch,
            part: ['contentDetails']
        });
        
        videoData.data?.items?.forEach((item: any) => {
            if (item.id) {
                // Double check before saving details
                if (!videoFileExists(NAMESPACE_VIDEO_CONTENT_DETAILS, item.id)) {
                    database.save(NAMESPACE_VIDEO_CONTENT_DETAILS, item.id, {
                        duration: item.contentDetails?.duration
                    });
                }
            }
        });
    }
}

export async function loadNewMovies(): Promise<string[]> {
    console.log("Starting downloading new movies");

    const youtube = google.youtube({
        version: 'v3',
        auth: process.env.YOUTUBE_API_KEY
    });

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
        throw new Error("uploadPlaylistId is missing");
    }

    let pageToken: string | undefined = undefined;
    const downloadedVideosIds: string[] = [];

    do {
        const playlistItemsResponse: any = await youtube.playlistItems.list({
            playlistId: uploadPlaylistId,
            maxResults: 50,
            part: ['snippet'],
            pageToken: pageToken
        });

        const items = playlistItemsResponse.data?.items || [];
        const now = new Date().toISOString();

        for (const playlistItem of items) {
            const videoId = playlistItem?.snippet?.resourceId?.videoId;
            if (!videoId) continue;

            // 1. Check if video file exists physically on disk WITHOUT reading/parsing it
            if (videoFileExists(NAMESPACE_VIDEO_SNIPPET, videoId)) {
                console.log(`[SKIP] Already exists on disk: ${videoId}`);
                continue; 
            }

            // 2. Alternatively, if using database.read, safely try/catch reading it:
            try {
                if (database.read(NAMESPACE_VIDEO_SNIPPET, videoId)) {
                    console.log(`[SKIP] Existing record found for: ${videoId}`);
                    continue;
                }
            } catch (err) {
                // If the file is corrupted JSON, skip it so we don't attempt editing or overwriting it
                console.warn(`[SKIP] File for ${videoId} is corrupted. Skipping to preserve file.`);
                continue;
            }

            // Save ONLY if the video does not exist yet
            const toSave = {
                schemaVersion: 1,
                retrievedAt: now,
                publishedAt: playlistItem.snippet?.publishedAt,
                title: playlistItem.snippet?.title || "",
                description: playlistItem.snippet?.description,
                thumbnail: playlistItem.snippet?.thumbnails,
                videoId: videoId
            };

            database.save(NAMESPACE_VIDEO_SNIPPET, videoId, toSave);
            downloadedVideosIds.push(videoId);
        }

        pageToken = playlistItemsResponse.data?.nextPageToken;

    } while (pageToken);

    if (downloadedVideosIds.length > 0) {
        await downloadContentDetails(youtube, downloadedVideosIds);
    }

    console.log(`Downloaded ${downloadedVideosIds.length} missing videos.`);

    return downloadedVideosIds;
}
