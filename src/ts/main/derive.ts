import type { OperationState, PrimaryControl, PrimaryLabel } from './types';

// deriveOperation() — THE single source of truth for the Start/Stop button's
// label, enabled state, gating, and reason. A faithful port of the nested
// fsState → configValid → mdState switch in ArrayOperation.page (captured in
// docs/research/main-page/ArrayOperation.page.txt). main-state.php deliberately
// does NOT compute this; everything funnels through here so the safety-critical
// logic lives in one exhaustively-tested place.
//
// Notes on fidelity:
//  - Encryption: when a luks member needs a key (enter-new/missing-key/
//    wrong-key), Start is gated OFF here. The operation panel re-enables it
//    client-side once a valid passphrase/keyfile is supplied (mirrors stock's
//    selectInput() enabling #cmdStart). So the *derived* default is disabled.
//  - confirmStart cases (DISABLE_DISK, missing pool disk, SWAP_DSBL mid-copy):
//    requiresConfirm=true and enabled=false until the user ticks the box.
//  - busy (/sub/mymonitor: 1 parity, 2 mover, 3 btrfs) disables Stop with a
//    reason, matching the stock disable of the Stop/Mover/Spin controls.

const CONFIG_REASONS: Record<string, string> = {
  error: 'Invalid, missing or expired registration key.',
  invalid: 'Too many attached devices — consider upgrading your registration key.',
  ineligible: 'Ineligible to run this version of Unraid OS — extend your registration key.',
  nokeyserver: 'Cannot contact key-server — check your network settings.',
  withdrawn: 'This Unraid OS release has been withdrawn — update your server.',
};

const ERROR_REASONS: Record<string, string> = {
  'ERROR:INVALID_EXPANSION':
    'Invalid expansion — you may not add new disk(s) and remove existing disk(s) at once.',
  'ERROR:NEW_DISK_TOO_SMALL': 'The replacement disk must be as big or bigger than the original.',
  'ERROR:PARITY_NOT_BIGGEST':
    'Disk in the parity slot is not the biggest. Move the largest disk into parity, or try Parity-Swap.',
  'ERROR:TOO_MANY_MISSING_DISKS': 'Too many wrong and/or missing disks.',
  'ERROR:NO_DATA_DISKS': 'No array data disks have been assigned.',
  'ERROR:NO_DEVICES': 'No array devices have been assigned.',
};

const ENCRYPTION_REASONS: Record<string, string> = {
  'enter-new': 'Enter a new encryption key to start the array.',
  'missing-key': 'Encryption key required to start the array.',
  'wrong-key': 'Wrong encryption key.',
};

function ctrl(
  label: PrimaryLabel,
  enabled: boolean,
  reason: string | null = null,
  requiresConfirm = false,
  requiresMaintenanceField = false,
): PrimaryControl {
  return { label, enabled, reason, requiresConfirm, requiresMaintenanceField };
}

export interface DeriveOpts {
  /** A pool/cache disk is missing (stock missing_cache()). Gates STOPPED Start
   *  behind a confirm. The page computes this from state.pools. */
  missingPoolDisk?: boolean;
  /** SWAP_DSBL parity copy is complete (fsCopyPrcnt === '100'). */
  swapCopyComplete?: boolean;
}

export function deriveOperation(op: OperationState, opts: DeriveOpts = {}): PrimaryControl {
  const busy = op.busy ?? 0;

  switch (op.fsState) {
    case 'Started': {
      if (busy !== 0) {
        const what =
          busy === 1 ? 'a parity operation' : busy === 2 ? 'the mover' : 'a pool operation';
        return ctrl('Stop', false, `Disabled — ${what} is running.`);
      }
      return ctrl('Stop', true, null);
    }
    case 'Starting':
      return ctrl('Starting…', false);
    case 'Stopping':
      return ctrl('Stopping…', false);
    case 'Formatting':
      return ctrl('Formatting…', false);
    case 'Copying':
      return ctrl('Cancel', true, 'Cancel will stop the parity copy.');
    case 'Clearing':
      return ctrl('Cancel', true, 'Cancel will stop the disk clear.');
    case 'Stopped':
      return deriveStopped(op, opts);
    default:
      return ctrl('Start', false, 'Unknown array state.');
  }
}

function deriveStopped(op: OperationState, opts: DeriveOpts): PrimaryControl {
  // 1) Registration / config gates — Start disabled, no override.
  if (op.configValid && op.configValid !== 'yes') {
    const reason = CONFIG_REASONS[op.configValid] ?? 'Configuration is not valid.';
    return ctrl('Start', false, reason);
  }

  // 2) mdState machine.
  const md = op.mdState;
  let result: PrimaryControl;

  if (md.startsWith('ERROR:')) {
    return ctrl('Start', false, ERROR_REASONS[md] ?? 'Array cannot start — configuration error.');
  }

  switch (md) {
    case 'STARTED':
      result = ctrl('Start', true, 'Start will bring the array online.', false, true);
      break;
    case 'STOPPED':
      if (opts.missingPoolDisk) {
        result = ctrl(
          'Start',
          false,
          'Start will remove the missing pool disk and then bring the array online.',
          true,
          true,
        );
      } else {
        result = ctrl('Start', true, 'Start will bring the array online.', false, true);
      }
      break;
    case 'NEW_ARRAY':
      result = ctrl(
        'Start',
        true,
        'Start will record all disk information and bring the array online (unprotected until Parity-Sync completes).',
        false,
        true,
      );
      break;
    case 'DISABLE_DISK':
      result = ctrl(
        'Start',
        false,
        'Start will disable the missing disk and bring the array online. Install a replacement as soon as possible.',
        true,
        true,
      );
      break;
    case 'RECON_DISK':
      result = ctrl(
        'Start',
        true,
        'Start will begin Parity-Sync and/or Data-Rebuild.',
        false,
        true,
      );
      break;
    case 'SWAP_DSBL':
      if (opts.swapCopyComplete) {
        result = ctrl(
          'Start',
          true,
          'Start will expand the data disk filesystem (if possible), bring the array online, and start Data-Rebuild.',
          false,
          true,
        );
      } else {
        // Stock shows a Copy button gated behind confirmStart; model it as a
        // confirm-gated primary so the UI surfaces the same safety gate.
        result = ctrl(
          'Start',
          false,
          'Copy will copy parity to the new parity disk; once complete the array may be started to rebuild the disabled disk.',
          true,
          false,
        );
      }
      break;
    default:
      result = ctrl('Start', true, 'Start will bring the array online.', false, true);
  }

  // 3) Encryption gate — applies wherever stock calls check_encryption()
  //    (all the cases above except the SWAP_DSBL mid-copy branch). When a key
  //    is needed, Start stays disabled until the panel collects a valid key.
  const encMode = op.encryption?.mode;
  if (encMode && ENCRYPTION_REASONS[encMode]) {
    return {
      ...result,
      enabled: false,
      reason: ENCRYPTION_REASONS[encMode],
    };
  }

  return result;
}
