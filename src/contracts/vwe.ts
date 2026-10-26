/**
 * Typed VWE boundary for the current vanilla JavaScript interface.
 * Pure types: zero runtime changes to the existing dashboard.
 */
export type VweDataset='advanced'|'emission'|'inspections'|'repairs';
export type DataStatus='received'|'empty';
export type FailureStage='session'|'validation'|'configuration'|'authentication'|'vehicle'|'traffic'|'network';
export interface VweNamedValue {
 name?:string|number|null;
 description?:string|number|null;
 code?:string|number|null;
 [key:string]:unknown;
}
export type VweReference=VweNamedValue|string|null;
export interface VweAdvanced {
 make?:VweReference;
 model?:VweReference;
 vehicleType?:VweReference;
 engineCode?:string|number|null;
 firstAdmissionDate?:string|number|null;
 maximumMass?:string|number|null;
 fuels?:(VweNamedValue|string|null)[];
 [key:string]:unknown;
}
export interface VweEmission {
 euroClass?:string|number|null;
 energyLabel?:string|number|null;
 gearbox?:VweNamedValue|string|null;
 noiseLevel?:VweNamedValue|null;
 [key:string]:unknown;
}
export type VweHistory=readonly unknown[]|{
 inspections?:readonly unknown[];
 repairs?:readonly unknown[];
 data?:readonly unknown[];
 results?:readonly unknown[];
 items?:readonly unknown[];
 [key:string]:unknown;
};
export interface VehicleByDataset {
 advanced:VweAdvanced;
 emission:VweEmission;
 inspections:VweHistory;
 repairs:VweHistory;
}
export interface VweDiagnostics {
 attempts:number;
 tokenRefreshed:boolean;
 coalesced?:boolean;
 durationMs?:number;
}
export interface VweSuccess<D extends VweDataset=VweDataset> {
 licensePlate:string;
 source:'VWE acceptatie';
 dataset:D;
 vehicle:VehicleByDataset[D];
 dataStatus:DataStatus;
 diagnostics:VweDiagnostics;
}
export interface VweFailure {
 error:string;
 code:string;
 stage:FailureStage;
 dataset?:VweDataset;
 upstreamStatus?:number;
 diagnostics?:VweDiagnostics;
}
export type VweApiResponse<D extends VweDataset=VweDataset>=VweSuccess<D>|VweFailure;
