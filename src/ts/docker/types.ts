// Docker page state — typed shape for the data layer.
//
// containers[] comes from our docker-state.php (which wraps Unraid's
// DockerContainers::getAllInfo()). folders + tags + tagAssignments come from
// docker-folders.json + docker-tags.json on the flash drive.

export type DockerContainerState = 'started' | 'stopped' | 'paused' | 'unknown';

export interface DockerContainerPort {
  host: string;            // "192.0.2.30" or "*"
  hostPort: string;        // "32400"
  containerPort: string;   // "32400"
  proto: string;           // "tcp" | "udp"
}

export interface DockerContainerFull {
  name: string;
  id: string;                   // short docker id (12 hex)
  image: string;                // "linuxserver/plex:latest"
  state: DockerContainerState;
  autostart: boolean;
  uptime: string | null;        // "3d 12h" — null when stopped
  cpuPct: number | null;        // null until first nchan delta lands
  memBytes: number | null;
  vdiskBytes: number | null;    // SizeRw — RW layer size from docker inspect --size
  macAddress: string | null;    // first network's MAC; null for host/none
  webuiUrl: string | null;      // resolved by getAllInfo()
  iconUrl: string;              // resolved by getAllInfo() — pre-cached path
  ports: DockerContainerPort[];
  updateAvailable: boolean;
  templatePath: string;         // /boot/config/plugins/dockerMan/templates-user/my-X.xml
  shell: string;                // "bash" | "sh" — for the console action
}

export interface DockerFolder {
  id: string;                   // uuid (stable across rename)
  name: string;
  icon: string;                 // lucide name from a curated set
  color: string;                // hex like "#ff8c2f"
  containerNames: string[];     // ordered membership; canonical assignment
}

export interface DockerTag {
  id: string;
  name: string;
  color: string;                // hex
}

export type DockerFolderColor = string;

export interface DockerFoldersFile {
  version: 1;
  folders: DockerFolder[];
}

export interface DockerTagsFile {
  version: 1;
  tags: DockerTag[];
  assignments: Record<string, string[]>;  // containerName -> tagId[]
}

export interface DockerPageState {
  containers: DockerContainerFull[];
  folders: DockerFolder[];
  tags: DockerTag[];
  tagAssignments: Record<string, string[]>;
}

// Live deltas from nchan /sub/dockerload — sparse, only changed fields.
export interface DockerDelta {
  name: string;
  state?: DockerContainerState;
  cpuPct?: number;
  memBytes?: number;
  uptime?: string;
  updateAvailable?: boolean;
}

// Filter UI state — URL-syncable.
export interface DockerFilters {
  query: string;                // free text
  state: 'all' | 'running' | 'stopped';
  folderId: string | null;      // null = no folder filter
  tagIds: string[];             // AND combine
}
