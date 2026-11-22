/**
 * Shared pure-JS statutory limitation checker (CBIC Sec 73/74/74A, Sec 169 & MVAT Sec 23).
 * Safe for both Node backend and Vite browser bundle.
 */
export function checkNoticeLimitation(fy, section = 'Section 73', issueDate, serviceMode = 'PORTAL_ONLY') {
    const secStr = String(section || '').toUpperCase();
    const isSec74A = secStr.includes('74A');
    const isSec74 = !isSec74A && secStr.includes('74');
    const isMvat = secStr.includes('MVAT') || secStr.includes('23(');
    const normalizedFy = String(fy || '').trim();

    const limitationSchedule = {
        '2017-18': { sec73: '2023-12-31', sec74: '2025-02-05' },
        '2018-19': { sec73: '2024-04-30', sec74: '2025-12-31' },
        '2019-20': { sec73: '2024-08-31', sec74: '2026-03-31' },
        '2020-21': { sec73: '2025-02-28', sec74: '2027-02-28' },
        '2021-22': { sec73: '2025-12-31', sec74: '2027-12-31' },
        '2022-23': { sec73: '2026-12-31', sec74: '2028-12-31' },
        '2023-24': { sec73: '2027-12-31', sec74: '2029-12-31' }
    };

    const parseDt = (d) => {
        if (!d) return null;
        if (typeof d === 'string' && d.includes('/')) {
            const p = d.split('/');
            return p.length === 3 ? new Date(`${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}T00:00:00Z`) : null;
        }
        return new Date(`${String(d).split('T')[0]}T00:00:00Z`);
    };

    const sec169Warning = serviceMode === 'PORTAL_ONLY'
        ? 'Portal-only upload without physical/email tender may be challenged u/s 169 for appeal condonation.'
        : '';

    const fyMatch = normalizedFy.match(/^(\d{4})-(\d{2})$/);
    if (isMvat && fyMatch) {
        const mvatDeadline = `${Number(fyMatch[1]) + 5}-03-31`;
        const issueDt = parseDt(issueDate);
        const isTimeBarred = issueDt && !isNaN(issueDt.getTime()) ? issueDt.getTime() > new Date(`${mvatDeadline}T23:59:59Z`).getTime() : false;
        return {
            isTimeBarred,
            deadline: mvatDeadline,
            limitationBasis: isTimeBarred ? 'Time-Barred under MVAT Sec 23' : 'Within MVAT Limitation',
            statutoryCitation: `MVAT Act Section 23 (4-year standard window ending ${mvatDeadline}; Section 26 appeal = 60 days)`,
            sec169Warning
        };
    }

    if (isSec74A || (fyMatch && Number(fyMatch[1]) >= 2024)) {
        const gstr9DueYear = (fyMatch ? Number(fyMatch[1]) : 2024) + 1;
        const scnDeadline = `${gstr9DueYear + 3}-06-30`;
        const orderDeadline = `${gstr9DueYear + 4}-12-31`;
        const issueDt = parseDt(issueDate);
        const isTimeBarred = issueDt && !isNaN(issueDt.getTime()) ? issueDt.getTime() > new Date(`${scnDeadline}T23:59:59Z`).getTime() : false;
        return {
            isTimeBarred,
            deadline: scnDeadline,
            orderDeadline,
            limitationBasis: isTimeBarred ? 'SCN Time-Barred u/s 74A(2)' : 'Within Section 74A Unified Window (42m SCN / 48m Order)',
            statutoryCitation: `Section 74A of CGST Act (FY ${normalizedFy}: SCN 42 months = ${scnDeadline}; Order 48 months = ${orderDeadline}; 60-day reduced penalty u/s 74A(8))`,
            sec169Warning
        };
    }

    const entry = limitationSchedule[normalizedFy];
    if (!entry || !issueDate) {
        return { isTimeBarred: false, deadline: null, limitationBasis: 'Standard Limitation', statutoryCitation: '', sec169Warning };
    }

    const deadlineStr = isSec74 ? entry.sec74 : entry.sec73;
    const deadlineDate = new Date(`${deadlineStr}T23:59:59Z`);
    const issueDt = parseDt(issueDate);

    if (!issueDt || isNaN(issueDt.getTime())) {
        return { isTimeBarred: false, deadline: deadlineStr, limitationBasis: 'Standard Limitation', statutoryCitation: '', sec169Warning };
    }

    const isTimeBarred = issueDt.getTime() > deadlineDate.getTime();
    const citation = isSec74
        ? `Section 74(10) of CGST Act, 2017 (5-year limitation deadline was ${deadlineStr})`
        : `Section 73(10) of CGST Act, 2017 read with Notification Nos. 09/2023-CT & 56/2023-CT (Statutory limitation deadline was ${deadlineStr})`;

    return {
        isTimeBarred,
        deadline: deadlineStr,
        limitationBasis: isTimeBarred ? 'Time-Barred by Limitation' : 'Within Limitation Period',
        statutoryCitation: citation,
        sec169Warning
    };
}

