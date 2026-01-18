const DEFAULT_PLAYLIST_NAME = "Draft Playlist";
export const DRAFT_STORAGE_KEY = "mkrshift_dotscreen_draft";

function generatePlaylistId(){
  if(typeof crypto !== "undefined" && crypto.randomUUID){
    return crypto.randomUUID();
  }
  return `playlist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createPlaylist({
  id,
  name = DEFAULT_PLAYLIST_NAME,
  slides = [],
  createdAt,
  updatedAt,
  version = 1,
} = {}){
  const timestamp = new Date().toISOString();
  return {
    id: id ?? generatePlaylistId(),
    name,
    slides,
    createdAt: createdAt ?? timestamp,
    updatedAt: updatedAt ?? timestamp,
    version,
  };
}

export function touchPlaylist(playlist){
  if(!playlist) return;
  playlist.updatedAt = new Date().toISOString();
}
