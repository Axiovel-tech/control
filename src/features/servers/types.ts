import { type Identifier } from '~/utils/collections';

export enum Protocol {
  TCP = 'tcp',
  WS = 'ws',
}

export type ServerParameters = {
  id: Identifier;
  hostName: string;
  label: string;
  port: number;
  protocol: string; // Not the same as `Protocol` in `server-settings-dialog`!
  type: 'detected' | 'inferred';
};

export enum ServerSettingsDialogTab {
  AUTO = 'auto',
  MANUAL = 'manual',
}
