export type TypeMappingResult = {
  tsType: string;
  imports: string[];
};

export type ContractEntry = {
  name: string;
  kind: 'interface' | 'type' | 'enum';
  definition: string;
  jsDoc?: string;
};

export type ContractsOutput = {
  entries: ContractEntry[];
};
