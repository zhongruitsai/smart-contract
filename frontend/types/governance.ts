export type Phase = 0 | 1 | 2 | 3;
export type ProposalType = 0 | 1 | 2 | 3 | 4;
export type VoteResult = 0 | 1 | 2;

export interface Proposal {
  id: bigint;
  proposer: `0x${string}`;
  description: string;
  pType: number;
  snapshotId: bigint;
  voteEnd: bigint;
  meetingDate: bigint;
  totalSupplyAtSnapshot: bigint;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  isCosignProposal: boolean;
  cosignDeadline: bigint;
  cosignerCount: bigint;
  isActive: boolean;
  votingStarted: boolean;
  finalized: boolean;
  result: number;
}

export interface Election {
  id: bigint;
  meetingDate: bigint;
  seatCount: bigint;
  voteEnd: bigint;
  snapshotId: bigint;
  finalized: boolean;
  candidateCount: bigint;
}
