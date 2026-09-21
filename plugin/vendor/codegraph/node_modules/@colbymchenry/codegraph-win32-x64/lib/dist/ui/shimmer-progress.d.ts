export interface IndexProgress {
    phase: string;
    current: number;
    total: number;
}
export interface ShimmerProgress {
    onProgress: (progress: IndexProgress) => void;
    stop: () => Promise<void>;
}
export declare function createShimmerProgress(): ShimmerProgress;
//# sourceMappingURL=shimmer-progress.d.ts.map