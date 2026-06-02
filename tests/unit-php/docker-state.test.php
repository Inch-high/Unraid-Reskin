<?php

// Tests for docker-state.php's transient-empty disambiguation.
//
// Background: while the stock update_container flow recreates a container it
// rewrites the webui-info docker.json that DockerTemplates::getAllInfo() reads,
// so getAllInfo() momentarily returns an empty list even though the docker
// daemon still has every container. Serving that empty list blanked the
// modernui /Docker page. getDockerContainers() hits the docker socket directly
// (the source of truth, unaffected by the rewrite), so modernui_is_transient_empty()
// distinguishes "mid-rewrite" (info empty, daemon non-empty → 503) from a
// genuinely empty server (both empty → 200 with []).
//
// We can't exercise modernui_docker_state() end-to-end — it needs Unraid's
// DockerTemplates/DockerClient, absent in the sandbox — but its bootstrap is
// guarded by is_file()/PHP_SAPI so requiring the file is safe and the pure
// helper is testable in isolation.

// Quiet the bootstrap's $_SERVER['DOCUMENT_ROOT'] read under CLI.
$_SERVER['DOCUMENT_ROOT'] = $_SERVER['DOCUMENT_ROOT'] ?? sys_get_temp_dir();

require_once __DIR__ . '/../../package/include/docker-state.php';

// ===========================================================================
// modernui_is_transient_empty()
// ===========================================================================

assert(
    modernui_is_transient_empty(0, 43) === true,
    'info empty + daemon non-empty → transient (mid-rewrite)'
);

assert(
    modernui_is_transient_empty(0, 0) === false,
    'both empty → genuinely empty server, NOT transient (must render empty state)'
);

assert(
    modernui_is_transient_empty(43, 43) === false,
    'steady state: info and daemon both populated → not transient'
);

assert(
    modernui_is_transient_empty(43, 0) === false,
    'info populated but daemon empty (odd) → not flagged; only an empty info triggers'
);

assert(
    modernui_is_transient_empty(1, 0) === false,
    'a single info row is non-empty → not transient'
);

echo "docker-state.test.php OK\n";
