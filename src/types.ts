export interface Identity {
  name: string;
  sshKeyPath: string;
  gitUserName: string;
  gitUserEmail: string;
}

export interface IdentitiesFile {
  version: number;
  identities: Identity[];
}
