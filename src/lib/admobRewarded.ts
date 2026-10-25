/*
 * Google AdMob Rewarded Ads integration for web.
 *
 * Requires the AdMob SDK script to be loaded in index.html:
 *   <script async src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"></script>
 *
 * Configure with env vars:
 *   VITE_ADMOB_REWARDED_UNIT_ID  - the rewarded ad unit ID (ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX)
 *
 * If the env var is not set, falls back to a simulated ad (for development).
 */

declare global {
  interface Window {
    googletag?: {
      cmd: Array<() => void>;
      defineOutOfPageSlot: (
        unitPath: string,
        outOfPage: { type: string }
      ) => any;
      pubads: () => {
        addEventListener: (
          event: string,
          handler: (event: any) => void
        ) => void;
        enableSingleRequest: () => void;
        refresh: () => void;
      };
      enableServices: () => void;
      destroySlots: () => boolean;
    };
  }
}

const ADMOB_REWARDED_UNIT_ID = import.meta.env.VITE_ADMOB_REWARDED_UNIT_ID ?? "";
const ADMOB_ENABLED = Boolean(ADMOB_REWARDED_UNIT_ID);

export function isAdMobEnabled(): boolean {
  return ADMOB_ENABLED;
}

/**
 * Shows a rewarded ad. Returns true if the ad was successfully watched
 * (and the user should be rewarded), false otherwise.
 *
 * When AdMob is not configured, falls back to a simulated 5-second ad.
 */
export function showRewardedAd(onProgress?: (loading: boolean) => void): Promise<boolean> {
  if (!ADMOB_ENABLED || !window.googletag) {
    return simulateAd(onProgress);
  }
  return realAdMobAd(onProgress);
}

function simulateAd(onProgress?: (loading: boolean) => void): Promise<boolean> {
  onProgress?.(true);
  return new Promise<boolean>((resolve) => {
    setTimeout(() => {
      onProgress?.(false);
      resolve(true);
    }, 5000);
  });
}

function realAdMobAd(onProgress?: (loading: boolean) => void): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    onProgress?.(true);

    const googletag = window.googletag!;
    let rewarded = false;

    googletag.cmd.push(() => {
      const slot = googletag.defineOutOfPageSlot(
        ADMOB_REWARDED_UNIT_ID,
        { type: "RewardedAds" }
      );

      if (!slot) {
        onProgress?.(false);
        resolve(false);
        return;
      }

      googletag.pubads().addEventListener("rewardedSlotReady", () => {
        // Ad is loaded and ready to show
      });

      googletag.pubads().addEventListener("rewardedSlotClosed", () => {
        onProgress?.(false);
        googletag.destroySlots();
        resolve(rewarded);
      });

      googletag.pubads().addEventListener("rewardedSlotGranted", () => {
        rewarded = true;
      });

      googletag.pubads().enableSingleRequest();
      googletag.enableServices();
      googletag.pubads().refresh();
    });

    setTimeout(() => {
      if (!rewarded) {
        onProgress?.(false);
        resolve(false);
      }
    }, 60000);
  });
}
