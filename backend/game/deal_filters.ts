// SPDX-License-Identifier: GPL-3.0-or-later
import { Deal } from "../../shared/types.ts";

export type DealFilter = {
    /** Logical predicate to filter deals */
    pred: (deal: Deal) => boolean;

    /**
     * If needed to generate some unique deals, there is a way to provide some
     * bigger cap limit.
     */
    limit?: number;
};

export function noFilter(): DealFilter {
    return {
        pred: (_deal: Deal) => true,
    };
}
