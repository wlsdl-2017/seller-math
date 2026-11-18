/**
 * SELLER MATH — 단일 공통 회계 엔진 및 공용 유틸리티 (common.js)
 * - 100% 순수 Vanilla JavaScript (외부 라이브러리 미사용)
 * - 브라우저(<script>) 및 Node.js(require) 양쪽 호환
 * - XSS 방어: 모든 동적 DOM 텍스트 렌더링에 textContent 사용
 * - localStorage: try-catch 방어 코드로 차단/손상 환경에서도 무오류 동작
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SellerMath = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STORAGE_KEY_STATE = 'seller_math_shared_state_v1';
  var STORAGE_KEY_SCENARIOS = 'seller_math_scenarios_v1';
  var STORAGE_KEY_LANG = 'seller_math_lang_v1';
  var MAX_SCENARIOS = 30;
  var VAT_RATE = 0.1;
  var EPSILON = 1e-9;

  function detectInitialLang() {
    try {
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        var params = new URLSearchParams(window.location.search);
        var qLang = params.get('lang');
        if (qLang === 'en' || qLang === 'ko') {
          if (window.localStorage) window.localStorage.setItem(STORAGE_KEY_LANG, qLang);
          return qLang;
        }
      }
      if (typeof window !== 'undefined' && window.localStorage) {
        var stored = window.localStorage.getItem(STORAGE_KEY_LANG);
        if (stored === 'en' || stored === 'ko') return stored;
      }
    } catch (e) {
      // ignore blocked storage
    }
    return 'ko';
  }

  var currentLang = detectInitialLang();

  function getLang() {
    return currentLang;
  }

  function t(koStr, enStr) {
    return currentLang === 'en' ? enStr : koStr;
  }

  var DEFAULT_INPUTS = {
    itemName: '샘플 상품 (3만 원)',
    listPrice: 30000,
    sellerDiscount: 0,
    platformDiscount: 0,
    platformSubsidyReimbursed: true,
    cogs: 10000,
    feeBasisMode: 'seller_revenue', // 'seller_revenue' | 'customer_payment' | 'total_payment_with_shipping' | 'custom_basis'
    feeRate: 10,
    customFeeMode: 'fixed_fee', // 'fixed_fee' | 'custom_base_rate'
    customFeeBase: 0,
    customerShipping: 0,
    sellerShippingCost: 3000,
    shippingFeeRate: 0,
    adSpend: 6000,
    // 고급 VAT 설정
    accountingBasis: 'cash_basis', // 'cash_basis' | 'supply_basis'
    revenueVatIncluded: true,
    cogsVatIncluded: true,
    cogsVatDeductible: true,
    feeVatIncluded: true,
    feeVatDeductible: true,
    shippingVatIncluded: true,
    shippingVatDeductible: true,
    adVatIncluded: true,
    adVatDeductible: true,
    // 세무 참고 설정
    taxpayerType: 'general', // 'general' | 'simplified' | 'exempt'
    simplifiedValueAddedRate: null, // 간이과세자 업종별 부가가치율 (%) — 미입력 시 null
    simplifiedInputCreditRate: 0.5,
    // 페이지별 부가 파라미터
    dailyVolume: 10,
    monthlyDays: 30,
    adRevenueBasis: 'seller_revenue', // 'seller_revenue' | 'customer_payment' | 'total_payment_with_shipping' | 'recognized_net_revenue'
    targetMode: 'profit_amount', // 'profit_amount' | 'margin_rate'
    targetProfitAmount: 8000,
    targetMarginRate: 26.67,
    sellerDiscountType: 'fixed', // 'fixed' | 'rate'
    sellerDiscountRate: 0,
    platformDiscountType: 'fixed', // 'fixed' | 'rate'
    platformDiscountRate: 0
  };

  var FEE_BASIS_LABELS = {
    seller_revenue: '판매자 귀속 상품 매출 비례',
    customer_payment: '고객 실결제가 비례',
    total_payment_with_shipping: '배송비 포함 결제금액 비례',
    custom_basis: '직접 입력 수수료 기준'
  };

  var AD_REVENUE_BASIS_LABELS = {
    seller_revenue: '판매자 귀속 상품 매출',
    customer_payment: '고객 실결제가 (상품가)',
    total_payment_with_shipping: '배송비 포함 고객 총결제액',
    recognized_net_revenue: '회계 기준 순매출 (공급가액/현금 선택 반영)'
  };

  var TAXPAYER_LABELS = {
    general: '일반과세자',
    simplified: '간이과세자',
    exempt: '면세사업자'
  };

  var FEE_BASIS_LABELS_EN = {
    seller_revenue: 'Proportional to Seller Product Revenue',
    customer_payment: 'Proportional to Customer Payment',
    total_payment_with_shipping: 'Proportional to Payment Incl. Shipping',
    custom_basis: 'Custom Fee Basis'
  };

  var AD_REVENUE_BASIS_LABELS_EN = {
    seller_revenue: 'Seller Product Revenue',
    customer_payment: 'Customer Payment (Product Price)',
    total_payment_with_shipping: 'Total Customer Payment Incl. Shipping',
    recognized_net_revenue: 'Recognized Net Revenue (Selected VAT Basis)'
  };

  var TAXPAYER_LABELS_EN = {
    general: 'General Taxpayer (10% VAT)',
    simplified: 'Simplified Taxpayer',
    exempt: 'VAT-Exempt Business'
  };

  function getFeeBasisLabel(mode) {
    return currentLang === 'en' ? FEE_BASIS_LABELS_EN[mode] : FEE_BASIS_LABELS[mode];
  }

  function getAdRevenueBasisLabel(mode) {
    return currentLang === 'en' ? AD_REVENUE_BASIS_LABELS_EN[mode] : AD_REVENUE_BASIS_LABELS[mode];
  }

  function getTaxpayerLabel(type) {
    return currentLang === 'en' ? TAXPAYER_LABELS_EN[type] : TAXPAYER_LABELS[type];
  }

  function cloneDefaults() {
    return Object.assign({}, DEFAULT_INPUTS);
  }

  function toNonNegativeNumber(val, fallback) {
    if (val === '' || val === null || typeof val === 'undefined') {
      return fallback;
    }
    var n = Number(val);
    if (!Number.isFinite(n) || n < 0) {
      return fallback;
    }
    return n;
  }

  function toFiniteNumber(val, fallback) {
    if (val === '' || val === null || typeof val === 'undefined') {
      return fallback;
    }
    var n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }

  function toBoolean(val, fallback) {
    if (typeof val === 'boolean') return val;
    if (val === 'true' || val === '1' || val === 1) return true;
    if (val === 'false' || val === '0' || val === 0) return false;
    return fallback;
  }

  function toSafeString(val, fallback, maxLen) {
    if (typeof val !== 'string') return fallback;
    var trimmed = val.slice(0, maxLen || 120);
    return trimmed;
  }

  function normalizeInputs(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var validFeeModes = ['seller_revenue', 'customer_payment', 'total_payment_with_shipping', 'custom_basis'];
    var validAdBases = ['seller_revenue', 'customer_payment', 'total_payment_with_shipping', 'recognized_net_revenue'];
    var validTaxTypes = ['general', 'simplified', 'exempt'];
    var validCustomFeeModes = ['fixed_fee', 'custom_base_rate'];
    var validAccountingBases = ['cash_basis', 'supply_basis'];
    var validTargetModes = ['profit_amount', 'margin_rate'];
    var validDiscountTypes = ['fixed', 'rate'];

    var simplifiedRate = null;
    if (src.simplifiedValueAddedRate !== null && src.simplifiedValueAddedRate !== '' && typeof src.simplifiedValueAddedRate !== 'undefined') {
      var parsedRate = Number(src.simplifiedValueAddedRate);
      if (Number.isFinite(parsedRate) && parsedRate > 0 && parsedRate <= 100) {
        simplifiedRate = parsedRate;
      }
    }

    return {
      itemName: toSafeString(src.itemName, DEFAULT_INPUTS.itemName, 80),
      listPrice: toNonNegativeNumber(src.listPrice, DEFAULT_INPUTS.listPrice),
      sellerDiscount: toNonNegativeNumber(src.sellerDiscount, DEFAULT_INPUTS.sellerDiscount),
      platformDiscount: toNonNegativeNumber(src.platformDiscount, DEFAULT_INPUTS.platformDiscount),
      platformSubsidyReimbursed: toBoolean(src.platformSubsidyReimbursed, DEFAULT_INPUTS.platformSubsidyReimbursed),
      cogs: toNonNegativeNumber(src.cogs, DEFAULT_INPUTS.cogs),
      feeBasisMode: validFeeModes.indexOf(src.feeBasisMode) !== -1 ? src.feeBasisMode : DEFAULT_INPUTS.feeBasisMode,
      feeRate: toNonNegativeNumber(src.feeRate, DEFAULT_INPUTS.feeRate),
      customFeeMode: validCustomFeeModes.indexOf(src.customFeeMode) !== -1 ? src.customFeeMode : DEFAULT_INPUTS.customFeeMode,
      customFeeBase: toNonNegativeNumber(src.customFeeBase, DEFAULT_INPUTS.customFeeBase),
      customerShipping: toNonNegativeNumber(src.customerShipping, DEFAULT_INPUTS.customerShipping),
      sellerShippingCost: toNonNegativeNumber(src.sellerShippingCost, DEFAULT_INPUTS.sellerShippingCost),
      shippingFeeRate: toNonNegativeNumber(src.shippingFeeRate, DEFAULT_INPUTS.shippingFeeRate),
      adSpend: toNonNegativeNumber(src.adSpend, DEFAULT_INPUTS.adSpend),

      accountingBasis: validAccountingBases.indexOf(src.accountingBasis) !== -1 ? src.accountingBasis : DEFAULT_INPUTS.accountingBasis,
      revenueVatIncluded: toBoolean(src.revenueVatIncluded, DEFAULT_INPUTS.revenueVatIncluded),
      cogsVatIncluded: toBoolean(src.cogsVatIncluded, DEFAULT_INPUTS.cogsVatIncluded),
      cogsVatDeductible: toBoolean(src.cogsVatDeductible, DEFAULT_INPUTS.cogsVatDeductible),
      feeVatIncluded: toBoolean(src.feeVatIncluded, DEFAULT_INPUTS.feeVatIncluded),
      feeVatDeductible: toBoolean(src.feeVatDeductible, DEFAULT_INPUTS.feeVatDeductible),
      shippingVatIncluded: toBoolean(src.shippingVatIncluded, DEFAULT_INPUTS.shippingVatIncluded),
      shippingVatDeductible: toBoolean(src.shippingVatDeductible, DEFAULT_INPUTS.shippingVatDeductible),
      adVatIncluded: toBoolean(src.adVatIncluded, DEFAULT_INPUTS.adVatIncluded),
      adVatDeductible: toBoolean(src.adVatDeductible, DEFAULT_INPUTS.adVatDeductible),

      taxpayerType: validTaxTypes.indexOf(src.taxpayerType) !== -1 ? src.taxpayerType : DEFAULT_INPUTS.taxpayerType,
      simplifiedValueAddedRate: simplifiedRate,
      simplifiedInputCreditRate: toNonNegativeNumber(src.simplifiedInputCreditRate, DEFAULT_INPUTS.simplifiedInputCreditRate),

      dailyVolume: toNonNegativeNumber(src.dailyVolume, DEFAULT_INPUTS.dailyVolume),
      monthlyDays: toNonNegativeNumber(src.monthlyDays, DEFAULT_INPUTS.monthlyDays),
      adRevenueBasis: validAdBases.indexOf(src.adRevenueBasis) !== -1 ? src.adRevenueBasis : DEFAULT_INPUTS.adRevenueBasis,
      targetMode: validTargetModes.indexOf(src.targetMode) !== -1 ? src.targetMode : DEFAULT_INPUTS.targetMode,
      targetProfitAmount: toFiniteNumber(src.targetProfitAmount, DEFAULT_INPUTS.targetProfitAmount),
      targetMarginRate: toFiniteNumber(src.targetMarginRate, DEFAULT_INPUTS.targetMarginRate),
      sellerDiscountType: validDiscountTypes.indexOf(src.sellerDiscountType) !== -1 ? src.sellerDiscountType : DEFAULT_INPUTS.sellerDiscountType,
      sellerDiscountRate: toNonNegativeNumber(src.sellerDiscountRate, DEFAULT_INPUTS.sellerDiscountRate),
      platformDiscountType: validDiscountTypes.indexOf(src.platformDiscountType) !== -1 ? src.platformDiscountType : DEFAULT_INPUTS.platformDiscountType,
      platformDiscountRate: toNonNegativeNumber(src.platformDiscountRate, DEFAULT_INPUTS.platformDiscountRate)
    };
  }

  /**
   * 매출 VAT 분해 헬퍼
   */
  function splitVatRevenue(amount, vatIncluded, accountingBasis, taxpayerType) {
    if (taxpayerType === 'exempt') {
      return {
        inputAmount: amount,
        cash: amount,
        supply: amount,
        vat: 0,
        recognized: amount
      };
    }
    var cash, supply, vat;
    if (vatIncluded) {
      cash = amount;
      supply = amount / (1 + VAT_RATE);
      vat = cash - supply;
    } else {
      supply = amount;
      vat = amount * VAT_RATE;
      cash = supply + vat;
    }
    var recognized = accountingBasis === 'supply_basis' ? supply : cash;
    return {
      inputAmount: amount,
      cash: cash,
      supply: supply,
      vat: vat,
      recognized: recognized
    };
  }

  /**
   * 비용 항목 VAT 분해 및 매입세액 공제 처리 헬퍼
   */
  function splitVatCost(amount, vatIncluded, vatDeductible, accountingBasis) {
    var cash, supply, vat;
    if (vatIncluded) {
      cash = amount;
      supply = amount / (1 + VAT_RATE);
      vat = cash - supply;
    } else {
      supply = amount;
      vat = amount * VAT_RATE;
      cash = supply + vat;
    }
    var deductibleVat = vatDeductible ? vat : 0;
    var recognized;
    if (accountingBasis === 'supply_basis') {
      // 적격증빙 매입세액 공제가 가능한 비용만 공급가액 기준(부가세 제외), 불공제 비용은 부가세 포함 전액 비용 처리
      recognized = vatDeductible ? supply : cash;
    } else {
      recognized = cash;
    }
    return {
      inputAmount: amount,
      cash: cash,
      supply: supply,
      vat: vat,
      deductibleVat: deductibleVat,
      vatIncluded: vatIncluded,
      vatDeductible: vatDeductible,
      recognized: recognized
    };
  }

  /**
   * 세무 참고용 예상 부가세 정산 추정 (손익/현금 정산과 엄격 분리)
   */
  function computeTaxEstimate(inp, revVat, cogsVat, feeVat, shipVat, adVat) {
    var type = inp.taxpayerType;
    var deductibleNames = [];
    var nonDeductibleNames = [];
    var costEntries = [
      { label: t('상품 원가', 'COGS'), obj: cogsVat },
      { label: t('마켓 수수료', 'Marketplace Fee'), obj: feeVat },
      { label: t('배송 원가', 'Shipping Cost'), obj: shipVat },
      { label: t('광고비', 'Ad Spend'), obj: adVat }
    ];
    costEntries.forEach(function (entry) {
      if (entry.obj.vatDeductible) {
        deductibleNames.push(entry.label);
      } else {
        nonDeductibleNames.push(entry.label);
      }
    });

    if (type === 'exempt') {
      return {
        taxpayerType: 'exempt',
        taxpayerLabel: getTaxpayerLabel('exempt'),
        status: 'ok',
        outputVat: 0,
        deductibleInputVat: 0,
        estimatedVatPayable: 0,
        displayAmount: t('0원 (부가세 면세)', '0 KRW (VAT Exempt)'),
        assumptions: [
          t(
            '면세사업자는 매출에 대한 부가가치세 신고·납부 의무가 없습니다.',
            'VAT-exempt businesses have no output VAT filing or remittance obligation on sales.'
          ),
          t(
            '매입 비용(수수료·택배비·광고비 등)에 포함된 부가세는 환급·공제되지 않으므로 실제 현금 지출(VAT 포함) 기준으로 손익을 확인하는 것이 정확합니다.',
            'Input VAT paid on fees, shipping, and ads is not creditable/refundable; evaluate P&L on the VAT-inclusive cash basis.'
          )
        ],
        excludedNote: t(
          '면세사업자 사업장현황신고 및 종합소득세는 별도 세목이며 본 추정치에 포함되지 않습니다.',
          'Business status reporting and annual income tax are separate obligations and excluded from this estimate.'
        )
      };
    }

    if (type === 'simplified') {
      if (inp.simplifiedValueAddedRate === null || inp.simplifiedValueAddedRate <= 0) {
        return {
          taxpayerType: 'simplified',
          taxpayerLabel: getTaxpayerLabel('simplified'),
          status: 'incomplete',
          outputVat: null,
          deductibleInputVat: null,
          estimatedVatPayable: null,
          displayAmount: t('산출 보류 (필수 정보 미입력)', 'Pending (Required Industry Rate Missing)'),
          assumptions: [
            t(
              '간이과세자는 업종별 부가가치율(예: 소매업 15% 등)과 적격증빙(세금계산서·현금영수증·사업용카드) 수취 여부에 따라 세액이 크게 달라집니다.',
              'Simplified taxpayer VAT depends heavily on the industry value-added rate (e.g., 15% retail) and qualified tax invoices.'
            ),
            t(
              '고급 설정에서 [업종별 부가가치율(%)]을 직접 입력하기 전에는 임의의 확정 세액을 산출하지 않습니다.',
              'No arbitrary tax estimate is computed until the Industry Value-Added Rate (%) is explicitly entered in Advanced Settings.'
            )
          ],
          excludedNote: t(
            '직전 연도 공급대가 4,800만 원 미만(또는 법령상 납부의무 면제 기준) 해당 여부 및 연 매출 규모는 건당 계산기에서 판단하지 않습니다.',
            'Annual revenue thresholds for VAT exemption eligibility are not evaluated in this per-order calculator.'
          )
        };
      }
      var vaRate = inp.simplifiedValueAddedRate / 100;
      var creditRate = inp.simplifiedInputCreditRate / 100;
      var simplifiedGrossVat = revVat.cash * VAT_RATE * vaRate;
      var qualifiedCashTotal =
        (cogsVat.vatDeductible ? cogsVat.cash : 0) +
        (feeVat.vatDeductible ? feeVat.cash : 0) +
        (shipVat.vatDeductible ? shipVat.cash : 0) +
        (adVat.vatDeductible ? adVat.cash : 0);
      var simplifiedCredit = qualifiedCashTotal * creditRate;
      var simplifiedNetVat = Math.max(0, simplifiedGrossVat - simplifiedCredit);

      return {
        taxpayerType: 'simplified',
        taxpayerLabel: getTaxpayerLabel('simplified'),
        status: 'ok',
        outputVat: simplifiedGrossVat,
        deductibleInputVat: simplifiedCredit,
        estimatedVatPayable: simplifiedNetVat,
        displayAmount: formatCurrency(simplifiedNetVat),
        assumptions: [
          t(
            '적용 기준: 공급대가(VAT 포함 매출) × 10% × 업종별 부가가치율(' + inp.simplifiedValueAddedRate + '%)',
            'Applied Basis: Gross Revenue × 10% × Industry Value-Added Rate (' + inp.simplifiedValueAddedRate + '%)'
          ),
          t(
            '공제 기준: 적격증빙 공제 가능 항목(' + (deductibleNames.length ? deductibleNames.join(', ') : '없음') + ') 매입대가 × ' + inp.simplifiedInputCreditRate + '% (환급 불가)',
            'Credit Basis: Qualified items (' + (deductibleNames.length ? deductibleNames.join(', ') : 'None') + ') × ' + inp.simplifiedInputCreditRate + '% (Non-refundable)'
          ),
          t(
            '불공제 처리 항목: ' + (nonDeductibleNames.length ? nonDeductibleNames.join(', ') : '없음'),
            'Non-deductible items: ' + (nonDeductibleNames.length ? nonDeductibleNames.join(', ') : 'None')
          )
        ],
        excludedNote: t(
          '간이과세자 부가가치세 납부의무 면제 기준(직전 연도 공급대가 기준) 및 전자세금계산서 발급 의무 여부는 연간 매출에 따라 달라지므로 제외되었습니다.',
          'Annual VAT payment exemption thresholds and e-invoice obligations depend on annual turnover and are excluded.'
        )
      };
    }

    // 일반과세자
    var outputVat = revVat.vat;
    var deductibleInputVat =
      cogsVat.deductibleVat +
      feeVat.deductibleVat +
      shipVat.deductibleVat +
      adVat.deductibleVat;
    var estimatedVatPayable = outputVat - deductibleInputVat;

    return {
      taxpayerType: 'general',
      taxpayerLabel: getTaxpayerLabel('general'),
      status: 'ok',
      outputVat: outputVat,
      deductibleInputVat: deductibleInputVat,
      estimatedVatPayable: estimatedVatPayable,
      displayAmount:
        estimatedVatPayable >= 0
          ? formatCurrency(estimatedVatPayable) + t(' (납부 예상)', ' (Est. Payable)')
          : formatCurrency(Math.abs(estimatedVatPayable)) + t(' (매입세액 초과·환급 예상)', ' (Est. Refundable Credit)'),
      assumptions: [
        t(
          '매출세액: 총 매출(' + formatCurrency(revVat.cash) + ')의 공급가액 기준 10% (' + formatCurrency(outputVat) + ')',
          'Output VAT: 10% on supply value of gross revenue ' + formatCurrency(revVat.cash) + ' (' + formatCurrency(outputVat) + ')'
        ),
        t(
          '적격증빙 매입세액 공제 반영 항목: ' + (deductibleNames.length ? deductibleNames.join(', ') : '없음 (모두 불공제)'),
          'Credited Input VAT items: ' + (deductibleNames.length ? deductibleNames.join(', ') : 'None')
        ),
        t(
          '매입세액 공제 제외(불공제) 항목: ' + (nonDeductibleNames.length ? nonDeductibleNames.join(', ') : '없음'),
          'Non-deductible items: ' + (nonDeductibleNames.length ? nonDeductibleNames.join(', ') : 'None')
        )
      ],
      excludedNote: t(
        '신용카드 매출전표 발행세액공제, 의제매입세액공제, 종합소득세·법인세, 4대 보험 및 고정 인건비는 본 건당 계산에서 제외되며 실제 세무 신고 결과와 다를 수 있습니다.',
        'Card sales tax credits, deemed input credits, corporate/income taxes, and fixed payroll are excluded; actual filings may differ.'
      )
    };
  }

  /**
   * Phase 1 핵심: 단일 공통 순이익·정산 계산 함수
   */
  function calculateProfit(rawInputs) {
    var inp = normalizeInputs(rawInputs);

    // 1. 쿠폰 부담 주체 및 매출 인식 분리
    var rawTotalDiscount = inp.sellerDiscount + inp.platformDiscount;
    var discountExceedsList = rawTotalDiscount > inp.listPrice + EPSILON;
    var sellerDiscountExceedsList = inp.sellerDiscount > inp.listPrice + EPSILON;

    var customerPayment = Math.max(0, inp.listPrice - inp.sellerDiscount - inp.platformDiscount);
    var sellerProductRevenue = inp.platformSubsidyReimbursed
      ? Math.max(0, inp.listPrice - inp.sellerDiscount)
      : customerPayment;
    var platformSubsidyRecognized = inp.platformSubsidyReimbursed
      ? Math.max(0, sellerProductRevenue - customerPayment)
      : 0;

    // 2. 수수료 부과 기준 4종 분리
    var feeBasisAmount = 0;
    var feeProduct = 0;
    var feeShipping = inp.customerShipping * (inp.shippingFeeRate / 100);

    if (inp.feeBasisMode === 'seller_revenue') {
      feeBasisAmount = sellerProductRevenue;
      feeProduct = feeBasisAmount * (inp.feeRate / 100);
    } else if (inp.feeBasisMode === 'customer_payment') {
      feeBasisAmount = customerPayment;
      feeProduct = feeBasisAmount * (inp.feeRate / 100);
    } else if (inp.feeBasisMode === 'total_payment_with_shipping') {
      feeBasisAmount = customerPayment + inp.customerShipping;
      feeProduct = customerPayment * (inp.feeRate / 100);
      feeShipping += inp.customerShipping * (inp.feeRate / 100);
    } else if (inp.feeBasisMode === 'custom_basis') {
      feeBasisAmount = inp.customFeeBase;
      if (inp.customFeeMode === 'fixed_fee') {
        feeProduct = inp.customFeeBase;
      } else {
        feeProduct = inp.customFeeBase * (inp.feeRate / 100);
      }
    }

    var feeTotalInput = feeProduct + feeShipping;
    var totalGrossRevenueInput = sellerProductRevenue + inp.customerShipping;

    // 3. VAT 분리 (현금 기준 vs 공급가액 손익 기준)
    var revVat = splitVatRevenue(totalGrossRevenueInput, inp.revenueVatIncluded, inp.accountingBasis, inp.taxpayerType);
    var feeVat = splitVatCost(feeTotalInput, inp.feeVatIncluded, inp.feeVatDeductible, inp.accountingBasis);
    var cogsVat = splitVatCost(inp.cogs, inp.cogsVatIncluded, inp.cogsVatDeductible, inp.accountingBasis);
    var shipVat = splitVatCost(inp.sellerShippingCost, inp.shippingVatIncluded, inp.shippingVatDeductible, inp.accountingBasis);
    var adVat = splitVatCost(inp.adSpend, inp.adVatIncluded, inp.adVatDeductible, inp.accountingBasis);

    // 4. 1단계: 플랫폼 정산 예정액 (실제 통장 입금 예정액, VAT 포함 현금 정산 기준)
    var platformSettlement = revVat.cash - feeVat.cash;

    // 5. 2단계: 선택된 회계 기준에 따른 공헌이익(C) 및 최종 영업 추정 이익
    var recognizedRevenue = revVat.recognized;
    var recognizedFee = feeVat.recognized;
    var recognizedCogs = cogsVat.recognized;
    var recognizedShipping = shipVat.recognized;
    var recognizedAdSpend = adVat.recognized;

    var contributionMargin = recognizedRevenue - recognizedCogs - recognizedFee - recognizedShipping;
    var operatingProfit = contributionMargin - recognizedAdSpend;

    // 현금 기준 이익 (비교용)
    var cashContributionMargin = revVat.cash - cogsVat.cash - feeVat.cash - shipVat.cash;
    var cashOperatingProfit = cashContributionMargin - adVat.cash;

    // 6. 마진율 및 ROI 예외 방어
    var netMarginRate = null;
    var netMarginLabel = t('산출 불가 (매출 0원)', 'N/A (Zero Revenue)');
    var contributionMarginRate = null;
    var contributionMarginLabel = t('산출 불가 (매출 0원)', 'N/A (Zero Revenue)');

    if (recognizedRevenue > EPSILON) {
      netMarginRate = (operatingProfit / recognizedRevenue) * 100;
      netMarginLabel = formatPercent(netMarginRate);
      contributionMarginRate = (contributionMargin / recognizedRevenue) * 100;
      contributionMarginLabel = formatPercent(contributionMarginRate);
    }

    var roi = null;
    var roiLabel = t('산출 불가 (원가 0원)', 'N/A (Zero COGS)');
    if (recognizedCogs > EPSILON) {
      roi = (operatingProfit / recognizedCogs) * 100;
      roiLabel = formatPercent(roi);
    }

    // 7. 세무 참고용 예상 부가세 정산 추정
    var taxEstimate = computeTaxEstimate(inp, revVat, cogsVat, feeVat, shipVat, adVat);

    // 8. 월간 시뮬레이션
    var monthlyUnits = inp.dailyVolume * inp.monthlyDays;
    var monthlySettlement = platformSettlement * monthlyUnits;
    var monthlyContributionMargin = contributionMargin * monthlyUnits;
    var monthlyOperatingProfit = operatingProfit * monthlyUnits;
    var monthlyRevenue = recognizedRevenue * monthlyUnits;
    var monthlyAdSpend = recognizedAdSpend * monthlyUnits;

    var accountingBasisLabel =
      inp.accountingBasis === 'supply_basis'
        ? t('공급가액 손익 기준 (적격증빙 매입세액 공제 반영)', 'Supply-Value P&L Basis (Deductible Input VAT Excluded)')
        : t('VAT 포함 현금 기준 (실제 현금 유출입 기준)', 'VAT-Inclusive Cash Basis (Actual Cash Flow)');

    return {
      inputs: inp,
      discountExceedsList: discountExceedsList,
      sellerDiscountExceedsList: sellerDiscountExceedsList,
      // 1단계 정산 지표
      listPrice: inp.listPrice,
      sellerDiscount: inp.sellerDiscount,
      platformDiscount: inp.platformDiscount,
      platformSubsidyRecognized: platformSubsidyRecognized,
      customerPayment: customerPayment,
      sellerProductRevenue: sellerProductRevenue,
      customerShipping: inp.customerShipping,
      totalGrossRevenueInput: totalGrossRevenueInput,
      feeBasisAmount: feeBasisAmount,
      feeBasisLabel: getFeeBasisLabel(inp.feeBasisMode),
      feeProduct: feeProduct,
      feeShipping: feeShipping,
      feeTotalInput: feeTotalInput,
      platformSettlement: platformSettlement,
      // 2단계 손익 지표
      accountingBasis: inp.accountingBasis,
      accountingBasisLabel: accountingBasisLabel,
      revVat: revVat,
      feeVat: feeVat,
      cogsVat: cogsVat,
      shipVat: shipVat,
      adVat: adVat,
      recognizedRevenue: recognizedRevenue,
      recognizedFee: recognizedFee,
      recognizedCogs: recognizedCogs,
      recognizedShipping: recognizedShipping,
      recognizedAdSpend: recognizedAdSpend,
      contributionMargin: contributionMargin,
      operatingProfit: operatingProfit,
      cashContributionMargin: cashContributionMargin,
      cashOperatingProfit: cashOperatingProfit,
      // 비율 및 예외 방어 라벨
      netMarginRate: netMarginRate,
      netMarginLabel: netMarginLabel,
      contributionMarginRate: contributionMarginRate,
      contributionMarginLabel: contributionMarginLabel,
      roi: roi,
      roiLabel: roiLabel,
      // 세무 참고
      taxEstimate: taxEstimate,
      // 월간 추정
      monthlyUnits: monthlyUnits,
      monthlySettlement: monthlySettlement,
      monthlyContributionMargin: monthlyContributionMargin,
      monthlyOperatingProfit: monthlyOperatingProfit,
      monthlyRevenue: monthlyRevenue,
      monthlyAdSpend: monthlyAdSpend
    };
  }

  /**
   * Phase 2.3: 손익분기 ROAS · 최대 허용 CPA 엔진 (공통 회계 엔진과 공헌이익 100% 연동)
   */
  function calculateRoas(rawInputs) {
    var profitRes = calculateProfit(rawInputs);
    var inp = profitRes.inputs;
    var C = profitRes.contributionMargin;

    // 광고 귀속 매출(R_ad) 결정
    var adRevenue = profitRes.sellerProductRevenue;
    if (inp.adRevenueBasis === 'customer_payment') {
      adRevenue = profitRes.customerPayment;
    } else if (inp.adRevenueBasis === 'total_payment_with_shipping') {
      adRevenue = profitRes.customerPayment + profitRes.customerShipping;
    } else if (inp.adRevenueBasis === 'recognized_net_revenue') {
      adRevenue = profitRes.recognizedRevenue;
    }

    var currentAdSpend = profitRes.recognizedAdSpend;
    var currentRoas = null;
    var currentRoasLabel = t('광고비 0원 (산출 제외)', '0 KRW Ad Spend (N/A)');
    if (currentAdSpend > EPSILON && adRevenue > EPSILON) {
      currentRoas = (adRevenue / currentAdSpend) * 100;
      currentRoasLabel = formatPercent(currentRoas);
    } else if (currentAdSpend > EPSILON && adRevenue <= EPSILON) {
      currentRoasLabel = t('귀속 매출 0원', 'Zero Attributed Revenue');
    }

    // 예외 방어: 공헌이익 C <= 0
    if (C <= EPSILON) {
      return {
        profitResult: profitRes,
        adRevenueBasis: inp.adRevenueBasis,
        adRevenueBasisLabel: getAdRevenueBasisLabel(inp.adRevenueBasis),
        adRevenue: adRevenue,
        contributionMargin: C,
        isAchievable: false,
        maxCpa: null,
        maxCpaLabel: t('산출 불가 (적자 구조)', 'N/A (Loss Structure)'),
        breakEvenRoas: null,
        breakEvenRoasLabel: t('손익분기 달성 불가', 'Unachievable'),
        errorMessage: t(
          '광고비 차감 전 공헌이익이 0원 이하(적자)이므로 광고 집행으로 손익분기를 달성할 수 없습니다.',
          'Pre-ad contribution margin is 0 or negative (loss); break-even ROAS cannot be achieved through ad spend.'
        ),
        currentAdSpend: currentAdSpend,
        currentRoas: currentRoas,
        currentRoasLabel: currentRoasLabel,
        simulations: []
      };
    }

    // 예외 방어: 광고 귀속 매출 <= 0 (공헌이익은 양수인데 상품 귀속 매출이 0인 극단 케이스)
    if (adRevenue <= EPSILON) {
      return {
        profitResult: profitRes,
        adRevenueBasis: inp.adRevenueBasis,
        adRevenueBasisLabel: getAdRevenueBasisLabel(inp.adRevenueBasis),
        adRevenue: adRevenue,
        contributionMargin: C,
        isAchievable: false,
        maxCpa: C,
        maxCpaLabel: formatCurrency(C),
        breakEvenRoas: null,
        breakEvenRoasLabel: t('산출 불가 (귀속 매출 0원)', 'N/A (Zero Attributed Revenue)'),
        errorMessage: t(
          '선택된 광고 귀속 매출 기준 금액이 0원이므로 ROAS 백분율을 산출할 수 없습니다.',
          'Cannot compute ROAS percentage because selected ad-attributed revenue is 0.'
        ),
        currentAdSpend: currentAdSpend,
        currentRoas: currentRoas,
        currentRoasLabel: currentRoasLabel,
        simulations: []
      };
    }

    var maxCpa = C;
    var breakEvenRoas = (adRevenue / C) * 100;

    // 목표 ROAS 구간별 시뮬레이션 (손익분기 ROAS 포함 및 주요 배수)
    var targetLevels = [150, 200, 250, 300, 400, 500, 600, 800, 1000];
    var roundedBe = Math.round(breakEvenRoas * 100) / 100;
    if (targetLevels.indexOf(roundedBe) === -1) {
      targetLevels.push(breakEvenRoas);
    }
    targetLevels.sort(function (a, b) {
      return a - b;
    });

    var simulations = targetLevels.map(function (roasPct) {
      var allowedAdSpend = adRevenue / (roasPct / 100);
      var expectedProfit = C - allowedAdSpend;
      var expectedMargin =
        profitRes.recognizedRevenue > EPSILON
          ? (expectedProfit / profitRes.recognizedRevenue) * 100
          : null;
      var isBreakEven = Math.abs(roasPct - breakEvenRoas) < 1e-6;
      var status = isBreakEven
        ? t('손익분기', 'Break-Even')
        : expectedProfit > 0.5
        ? t('흑자', 'Profit')
        : expectedProfit < -0.5
        ? t('적자', 'Loss')
        : t('손익분기', 'Break-Even');
      return {
        roasPct: roasPct,
        isBreakEven: isBreakEven,
        allowedAdSpend: allowedAdSpend,
        expectedProfit: expectedProfit,
        expectedMargin: expectedMargin,
        monthlyProfit: expectedProfit * profitRes.monthlyUnits,
        status: status
      };
    });

    return {
      profitResult: profitRes,
      adRevenueBasis: inp.adRevenueBasis,
      adRevenueBasisLabel: getAdRevenueBasisLabel(inp.adRevenueBasis),
      adRevenue: adRevenue,
      contributionMargin: C,
      isAchievable: true,
      maxCpa: maxCpa,
      maxCpaLabel: formatCurrency(maxCpa),
      breakEvenRoas: breakEvenRoas,
      breakEvenRoasLabel: formatPercent(breakEvenRoas),
      errorMessage: null,
      currentAdSpend: currentAdSpend,
      currentRoas: currentRoas,
      currentRoasLabel: currentRoasLabel,
      simulations: simulations
    };
  }

  /**
   * Phase 2.4: 동적 판매가 역산 & Round-Trip 자동 역검증 엔진
   */
  function calculateReversePrice(rawInputs) {
    var inp = normalizeInputs(rawInputs);

    // 할인율 / 할인액 유효성 확인
    var sellerRate = inp.sellerDiscountType === 'rate' ? inp.sellerDiscountRate / 100 : 0;
    var platformRate = inp.platformDiscountType === 'rate' ? inp.platformDiscountRate / 100 : 0;
    var totalRateDiscount = sellerRate + platformRate;

    var sellerFixed = inp.sellerDiscountType === 'fixed' ? inp.sellerDiscount : 0;
    var platformFixed = inp.platformDiscountType === 'fixed' ? inp.platformDiscount : 0;
    var totalFixedDiscount = sellerFixed + platformFixed;

    function buildError(msg) {
      return {
        success: false,
        errorMessage: msg,
        inputs: inp,
        exactListPrice: null,
        roundedListPrice: null,
        verifiedExact: null,
        verifiedRounded: null,
        verificationPassed: false,
        verificationBadgeText: null,
        discountSimulations: []
      };
    }

    if (totalRateDiscount >= 1 - EPSILON) {
      return buildError(
        t(
          '판매자 부담 할인율과 플랫폼 쿠폰 할인율의 합계가 100% 이상이므로 유효한 판매가를 역산할 수 없습니다.',
          'Combined seller and platform discount rates are 100% or higher; cannot reverse-calculate a valid selling price.'
        )
      );
    }

    if (inp.targetMode === 'margin_rate') {
      if (!Number.isFinite(inp.targetMarginRate) || inp.targetMarginRate < 0 || inp.targetMarginRate >= 100) {
        return buildError(
          t(
            '목표 순마진율은 0% 이상 100% 미만 범위여야 유효한 판매가를 역산할 수 있습니다.',
            'Target net margin rate must be between 0% and 100% (exclusive).'
          )
        );
      }
    }

    if (inp.feeBasisMode === 'custom_basis' && inp.targetMode === 'margin_rate') {
      // custom_basis에서 수수료가 고정이면 가격 상승에 따른 수수료 변화가 0이므로 정상 선형 계산 가능
    }

    // 주어진 등록 정가 P에서 공통 회계 엔진을 직접 호출하는 평가 함수
    function evalAtPrice(price) {
      var sDisc = inp.sellerDiscountType === 'rate' ? price * sellerRate : sellerFixed;
      var pDisc = inp.platformDiscountType === 'rate' ? price * platformRate : platformFixed;
      var clone = Object.assign({}, inp, {
        listPrice: price,
        sellerDiscount: sDisc,
        platformDiscount: pDisc
      });
      return calculateProfit(clone);
    }

    // 고객 실결제가 >= 0 이 되기 위한 최소 등록 정가 하한
    var pMin = totalFixedDiscount / (1 - totalRateDiscount);

    // 두 지점 샘플링으로 선형 계수(기울기/절편) 추출 (P >= pMin 구간에서 완전 선형)
    var p1 = pMin + 1000;
    var p2 = pMin + 101000;
    var r1 = evalAtPrice(p1);
    var r2 = evalAtPrice(p2);

    var aRev = (r2.recognizedRevenue - r1.recognizedRevenue) / (p2 - p1);
    var bRev = r1.recognizedRevenue - aRev * p1;
    var aProf = (r2.operatingProfit - r1.operatingProfit) / (p2 - p1);
    var bProf = r1.operatingProfit - aProf * p1;

    var pAlgebraic = null;
    if (inp.targetMode === 'profit_amount') {
      if (aProf <= EPSILON) {
        return buildError(
          t(
            '수수료율과 할인율 구조상 판매가를 높여도 순이익이 증가하지 않으므로(기울기 0 이하) 목표 순이익을 역산할 수 없습니다.',
            'Profit does not increase with higher price under the current fee/discount structure (slope <= 0).'
          )
        );
      }
      pAlgebraic = (inp.targetProfitAmount - bProf) / aProf;
    } else {
      var mu = inp.targetMarginRate / 100;
      var aEff = aProf - mu * aRev;
      if (aEff <= EPSILON) {
        return buildError(
          t(
            '수수료율과 목표 마진율(및 할인율)의 합이 100% 이상이므로 목표 마진율을 달성하는 판매가가 존재하지 않습니다.',
            'Fee rate + target margin rate (+ discount rate) is 100% or higher; no valid selling price exists.'
          )
        );
      }
      pAlgebraic = (mu * bRev - bProf) / aEff;
    }

    if (!Number.isFinite(pAlgebraic) || pAlgebraic <= 0) {
      return buildError(
        t(
          '현재 고정 비용·배송비 수익 조건에서는 양수 판매가로 목표값에 정확히 일치하는 유일한 해가 존재하지 않습니다.',
          'No unique positive selling price exists under the current fixed costs and shipping revenue settings.'
        )
      );
    }

    if (pAlgebraic < pMin - 1e-6) {
      return buildError(
        t(
          '설정된 정액 쿠폰 할인 합계(' +
            formatCurrency(totalFixedDiscount) +
            ')보다 낮은 가격대에 해가 위치하여 고객 결제가 0원 미만 구간이 되므로 역산이 불가합니다.',
          'Solution lies below total fixed discounts (' +
            formatCurrency(totalFixedDiscount) +
            '), making customer payment negative.'
        )
      );
    }

    // 수치해법(이진 탐색 Bisection)으로 공통 회계 엔진 직접 호출 정밀 탐색
    var targetFn;
    if (inp.targetMode === 'profit_amount') {
      targetFn = function (price) {
        return evalAtPrice(price).operatingProfit - inp.targetProfitAmount;
      };
    } else {
      var muVal = inp.targetMarginRate / 100;
      targetFn = function (price) {
        var res = evalAtPrice(price);
        return res.operatingProfit - muVal * res.recognizedRevenue;
      };
    }

    var low = Math.max(pMin, pAlgebraic * 0.9 - 10);
    var high = Math.max(pAlgebraic * 1.1 + 10, pMin + 100);
    var guard = 0;
    while (targetFn(low) > 0 && low > pMin && guard < 40) {
      low = Math.max(pMin, low - (high - low));
      guard++;
    }
    guard = 0;
    while (targetFn(high) < 0 && guard < 40) {
      high = high * 2 + 1000;
      guard++;
    }

    var pExact = pAlgebraic;
    if (targetFn(low) <= 0 && targetFn(high) >= 0) {
      for (var iter = 0; iter < 100; iter++) {
        var mid = (low + high) / 2;
        var val = targetFn(mid);
        if (Math.abs(val) <= 1e-10) {
          pExact = mid;
          break;
        }
        if (val < 0) {
          low = mid;
        } else {
          high = mid;
        }
        pExact = (low + high) / 2;
      }
    }

    // 3. Round-Trip 자동 역검증
    var verifiedExact = evalAtPrice(pExact);
    if (verifiedExact.recognizedRevenue <= EPSILON) {
      return buildError(
        t(
          '역산된 가격에서의 회계 기준 매출이 0원 이하이므로 유효한 판매가로 확정할 수 없습니다.',
          'Recognized revenue at the calculated price is zero or negative.'
        )
      );
    }

    var roundedListPrice = Math.round(pExact);
    var verifiedRounded = evalAtPrice(roundedListPrice);

    var verificationPassed = false;
    var verificationError = 0;
    var verificationBadgeText = '';

    if (inp.targetMode === 'profit_amount') {
      verificationError = Math.abs(verifiedExact.operatingProfit - inp.targetProfitAmount);
      verificationPassed = verificationError < 1e-3;
      verificationBadgeText = t(
        '[역검증 완료: 이 가격(' +
          formatCurrency(roundedListPrice) +
          ')으로 판매 시 목표 순이익 ' +
          formatCurrency(verifiedRounded.operatingProfit) +
          ' 달성 확인]',
        '[Round-Trip Verified: Selling at ' +
          formatCurrency(roundedListPrice) +
          ' achieves target profit of ' +
          formatCurrency(verifiedRounded.operatingProfit) +
          ']'
      );
    } else {
      verificationError =
        verifiedExact.netMarginRate !== null
          ? Math.abs(verifiedExact.netMarginRate - inp.targetMarginRate)
          : Infinity;
      verificationPassed = verificationError < 1e-4;
      verificationBadgeText = t(
        '[역검증 완료: 이 가격(' +
          formatCurrency(roundedListPrice) +
          ')으로 판매 시 순마진율 ' +
          verifiedRounded.netMarginLabel +
          ' (순이익 ' +
          formatCurrency(verifiedRounded.operatingProfit) +
          ') 달성 확인]',
        '[Round-Trip Verified: Selling at ' +
          formatCurrency(roundedListPrice) +
          ' achieves net margin ' +
          verifiedRounded.netMarginLabel +
          ' (Profit ' +
          formatCurrency(verifiedRounded.operatingProfit) +
          ')]'
      );
    }

    if (!verificationPassed) {
      return buildError(
        t(
          '역산 결과에 대한 공통 회계 엔진 역검증 허용 오차를 초과하여 계산을 중단했습니다.',
          'Round-trip verification residual exceeded tolerance; calculation halted.'
        )
      );
    }

    // 4. 등록 정가 대비 추가 할인율(5%, 10%, 15%, 20%, 30%)별 수익 비교 시뮬레이션
    var extraRates = [0, 5, 10, 15, 20, 30];
    var discountSimulations = extraRates.map(function (extraPct) {
      var effectiveListPrice = roundedListPrice;
      var baseSellerDisc = inp.sellerDiscountType === 'rate' ? effectiveListPrice * sellerRate : sellerFixed;
      var extraSellerDisc = effectiveListPrice * (extraPct / 100);
      var basePlatformDisc = inp.platformDiscountType === 'rate' ? effectiveListPrice * platformRate : platformFixed;

      var simResult = calculateProfit(
        Object.assign({}, inp, {
          listPrice: effectiveListPrice,
          sellerDiscount: baseSellerDisc + extraSellerDisc,
          platformDiscount: basePlatformDisc
        })
      );

      var status =
        simResult.operatingProfit > 0.5
          ? t('흑자', 'Profit')
          : simResult.operatingProfit < -0.5
          ? t('적자', 'Loss')
          : t('손익분기', 'Break-Even');

      return {
        extraDiscountPct: extraPct,
        extraDiscountAmount: extraSellerDisc,
        customerPayment: simResult.customerPayment,
        platformSettlement: simResult.platformSettlement,
        contributionMargin: simResult.contributionMargin,
        operatingProfit: simResult.operatingProfit,
        netMarginRate: simResult.netMarginRate,
        netMarginLabel: simResult.netMarginLabel,
        status: status
      };
    });

    return {
      success: true,
      errorMessage: null,
      inputs: inp,
      exactListPrice: pExact,
      roundedListPrice: roundedListPrice,
      verifiedExact: verifiedExact,
      verifiedRounded: verifiedRounded,
      verificationPassed: verificationPassed,
      verificationError: verificationError,
      verificationBadgeText: verificationBadgeText,
      discountSimulations: discountSimulations
    };
  }

  /**
   * 안전한 포맷팅 (최종 화면 표시 단계에서만 반올림)
   */
  function formatCurrency(val) {
    if (val === null || typeof val === 'undefined' || !Number.isFinite(val)) {
      return t('산출 불가', 'N/A');
    }
    var rounded = Math.round(val);
    if (Object.is(rounded, -0)) rounded = 0;
    return currentLang === 'en'
      ? rounded.toLocaleString('en-US') + ' KRW'
      : rounded.toLocaleString('ko-KR') + '원';
  }

  function formatNumber(val, decimals) {
    if (val === null || typeof val === 'undefined' || !Number.isFinite(val)) {
      return '-';
    }
    var d = typeof decimals === 'number' ? decimals : 0;
    var factor = Math.pow(10, d);
    var rounded = Math.round(val * factor) / factor;
    if (Object.is(rounded, -0)) rounded = 0;
    return rounded.toLocaleString(currentLang === 'en' ? 'en-US' : 'ko-KR', {
      minimumFractionDigits: d,
      maximumFractionDigits: d
    });
  }

  function formatPercent(val) {
    if (val === null || typeof val === 'undefined' || !Number.isFinite(val)) {
      return t('산출 불가', 'N/A');
    }
    return formatNumber(val, 2) + '%';
  }

  /**
   * Phase 2.5: CSV Injection 방어 및 RFC 4180 이스케이프
   * - 숫자 데이터와 사용자 입력 문자열을 구분하여 처리
   * - 선행 공백/제어문자(탭, 줄바꿈 등) 포함 뒤에 =, +, -, @ 가 오면 작은따옴표(')를 선행 부착
   * - 쉼표, 큰따옴표("" 이스케이프), 개행 문자를 큰따옴표로 감싸 RFC 4180 준수
   */
  function escapeCsvCell(value, isNumeric) {
    if (value === null || typeof value === 'undefined') {
      return '';
    }
    if (isNumeric && typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.round(value * 100) / 100);
    }

    var str = String(value);
    // 선행 공백이나 제어문자(\u0000-\u001f, \s) 뒤에 수식 시작 문자(=, +, -, @)가 오는지 검사
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(str)) {
      str = "'" + str;
    }

    // RFC 4180: 쉼표, 큰따옴표, 줄바꿈 또는 제어문자가 포함된 경우 큰따옴표로 감싸고 내부 큰따옴표는 두 번 표기
    if (/[",\r\n\t\u0000-\u001f]/.test(str)) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function buildCsvContent(rows) {
    var lines = rows.map(function (row) {
      return row
        .map(function (cell) {
          if (cell && typeof cell === 'object' && Object.prototype.hasOwnProperty.call(cell, 'value')) {
            return escapeCsvCell(cell.value, Boolean(cell.numeric));
          }
          return escapeCsvCell(cell, typeof cell === 'number');
        })
        .join(',');
    });
    // UTF-8 BOM(\uFEFF) 적용으로 Microsoft Excel 한글 깨짐 방지
    return '\uFEFF' + lines.join('\r\n');
  }

  function downloadCsv(filename, rows) {
    if (typeof document === 'undefined') return false;
    var csv = buildCsvContent(rows);
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    return true;
  }

  /**
   * 안전한 localStorage 헬퍼 (try-catch 방어)
   */
  function safeStorageGet(key, fallback) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return fallback;
      var raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function safeStorageSet(key, value) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadSharedInputs() {
    var saved = safeStorageGet(STORAGE_KEY_STATE, null);
    return normalizeInputs(saved);
  }

  function saveSharedInputs(inputs) {
    var normalized = normalizeInputs(inputs);
    return safeStorageSet(STORAGE_KEY_STATE, normalized);
  }

  function loadScenarios() {
    var saved = safeStorageGet(STORAGE_KEY_SCENARIOS, []);
    return Array.isArray(saved) ? saved : [];
  }

  function saveScenario(label, calcResult) {
    var list = loadScenarios();
    var entry = {
      id: 'sc_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      createdAt: new Date().toISOString().slice(0, 10),
      itemName: toSafeString(label || calcResult.inputs.itemName || '상품 시나리오', '상품 시나리오', 80),
      listPrice: calcResult.listPrice,
      customerPayment: calcResult.customerPayment,
      sellerDiscount: calcResult.sellerDiscount,
      platformDiscount: calcResult.platformDiscount,
      platformSubsidyReimbursed: calcResult.inputs.platformSubsidyReimbursed,
      feeTotalInput: calcResult.feeTotalInput,
      platformSettlement: calcResult.platformSettlement,
      recognizedRevenue: calcResult.recognizedRevenue,
      recognizedCogs: calcResult.recognizedCogs,
      recognizedShipping: calcResult.recognizedShipping,
      recognizedAdSpend: calcResult.recognizedAdSpend,
      contributionMargin: calcResult.contributionMargin,
      operatingProfit: calcResult.operatingProfit,
      netMarginRate: calcResult.netMarginRate,
      netMarginLabel: calcResult.netMarginLabel,
      roi: calcResult.roi,
      roiLabel: calcResult.roiLabel,
      accountingBasisLabel: calcResult.accountingBasisLabel
    };
    list.unshift(entry);
    if (list.length > MAX_SCENARIOS) {
      list = list.slice(0, MAX_SCENARIOS);
    }
    safeStorageSet(STORAGE_KEY_SCENARIOS, list);
    return list;
  }

  function deleteScenario(id) {
    var list = loadScenarios().filter(function (item) {
      return item && item.id !== id;
    });
    safeStorageSet(STORAGE_KEY_SCENARIOS, list);
    return list;
  }

  function clearScenarios() {
    safeStorageSet(STORAGE_KEY_SCENARIOS, []);
    return [];
  }

  /**
   * 클립보드 복사 (Clipboard API + execCommand Fallback)
   */
  function copyTextToClipboard(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return fallbackCopyText(text);
        }
      );
    }
    return Promise.resolve(fallbackCopyText(text));
  }

  function fallbackCopyText(text) {
    if (typeof document === 'undefined') return false;
    try {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return Boolean(ok);
    } catch (e) {
      return false;
    }
  }

  /**
   * 안전한 DOM 생성 헬퍼 (innerHTML 금지, textContent만 사용)
   */
  function createEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (typeof text !== 'undefined' && text !== null) {
      el.textContent = String(text);
    }
    return el;
  }

  function clearEl(el) {
    if (!el) return;
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  /**
   * Phase 2.1: 2단계 Waterfall Breakdown + 회계 전제조건 + 예상 부가세 참고 영역 공용 렌더러
   */
  function renderWaterfallBreakdown(container, result) {
    if (!container || !result) return;
    clearEl(container);

    var inp = result.inputs;
    var basisBadge = createEl(
      'div',
      'basis-banner',
      t('적용 회계 기준: ', 'Accounting Basis: ') +
        result.accountingBasisLabel +
        t(' | 과세 유형: ', ' | Taxpayer Type: ') +
        result.taxEstimate.taxpayerLabel
    );
    container.appendChild(basisBadge);

    if (result.discountExceedsList) {
      var warnBox = createEl(
        'div',
        'alert-box alert-warning',
        t(
          '주의: 판매자 부담 할인과 플랫폼 쿠폰 합계가 등록 정가를 초과하여 고객 실결제가는 0원(하한)으로 처리되었습니다.',
          'Warning: Combined discounts exceed list price; customer payment is floored at 0 KRW.'
        )
      );
      container.appendChild(warnBox);
    }

    var grid = createEl('div', 'waterfall-grid');
    var zeroCur = formatCurrency(0);

    // [1단계: 플랫폼 정산 내역]
    var stage1 = createEl('section', 'waterfall-card');
    var s1Header = createEl('div', 'waterfall-header');
    s1Header.appendChild(createEl('span', 'stage-pill stage-1', t('1단계', 'Stage 1')));
    s1Header.appendChild(createEl('h3', 'waterfall-title', t('플랫폼 정산 내역 (통장 입금 예정 기준)', 'Platform Settlement Breakdown (Bank Payout Basis)')));
    stage1.appendChild(s1Header);

    var s1List = createEl('ul', 'waterfall-list');
    var s1Rows = [
      { label: t('등록 판매가', 'List Price'), value: formatCurrency(result.listPrice), type: 'base' },
      { label: t('판매자 부담 할인', 'Seller Discount'), value: result.sellerDiscount > 0 ? '-' + formatCurrency(result.sellerDiscount) : zeroCur, type: 'minus' },
      {
        label: inp.platformSubsidyReimbursed
          ? t('플랫폼 쿠폰 할인 (정산 시 보전)', 'Platform Coupon (Reimbursed)')
          : t('플랫폼 쿠폰 할인 (미보전·매출 차감)', 'Platform Coupon (Not Reimbursed)'),
        value: result.platformDiscount > 0 ? '-' + formatCurrency(result.platformDiscount) : zeroCur,
        type: 'minus'
      },
      { label: t('고객 실결제 상품가', 'Buyer Paid Price'), value: formatCurrency(result.customerPayment), type: 'subtotal' },
      {
        label: inp.platformSubsidyReimbursed
          ? t('플랫폼 쿠폰 보전금', 'Coupon Reimbursement')
          : t('플랫폼 쿠폰 보전금 (해당 없음)', 'Coupon Reimbursement (None)'),
        value: result.platformSubsidyRecognized > 0 ? '+' + formatCurrency(result.platformSubsidyRecognized) : zeroCur,
        type: 'plus'
      },
      { label: t('판매자 귀속 상품 매출', 'Seller Product Revenue'), value: formatCurrency(result.sellerProductRevenue), type: 'subtotal' },
      { label: t('고객 결제 배송비', 'Customer Shipping Paid'), value: result.customerShipping > 0 ? '+' + formatCurrency(result.customerShipping) : zeroCur, type: 'plus' },
      { label: t('마켓 수수료 합계 (', 'Marketplace Fee Total (') + result.feeBasisLabel + ')', value: result.feeVat.cash > 0 ? '-' + formatCurrency(result.feeVat.cash) : zeroCur, type: 'minus' },
      { label: t('플랫폼 정산 예정액 (원가·택배·광고 차감 전)', 'Estimated Platform Payout (Before Costs & Ads)'), value: formatCurrency(result.platformSettlement), type: 'total' }
    ];

    s1Rows.forEach(function (row) {
      var li = createEl('li', 'waterfall-row row-' + row.type);
      li.appendChild(createEl('span', 'wf-label', row.label));
      li.appendChild(createEl('strong', 'wf-value', row.value));
      s1List.appendChild(li);
    });
    stage1.appendChild(s1List);
    grid.appendChild(stage1);

    // [2단계: 셀러 손익 계산 내역]
    var stage2 = createEl('section', 'waterfall-card');
    var s2Header = createEl('div', 'waterfall-header');
    s2Header.appendChild(createEl('span', 'stage-pill stage-2', t('2단계', 'Stage 2')));
    s2Header.appendChild(
      createEl(
        'h3',
        'waterfall-title',
        t(
          '셀러 손익 계산 내역 (' + (inp.accountingBasis === 'supply_basis' ? '공급가액 손익 기준' : 'VAT 포함 현금 기준') + ')',
          'Seller P&L Breakdown (' + (inp.accountingBasis === 'supply_basis' ? 'Supply-Value Basis' : 'VAT-Inclusive Cash Basis') + ')'
        )
      )
    );
    stage2.appendChild(s2Header);

    var s2List = createEl('ul', 'waterfall-list');
    var s2Rows = [
      { label: t('순매출 (배송비 수익 포함)', 'Net Revenue (Incl. Shipping)'), value: formatCurrency(result.recognizedRevenue), type: 'base' },
      { label: t('마켓 수수료', 'Marketplace Fee'), value: result.recognizedFee > 0 ? '-' + formatCurrency(result.recognizedFee) : zeroCur, type: 'minus' },
      { label: t('상품 매입 원가', 'Product Cost (COGS)'), value: result.recognizedCogs > 0 ? '-' + formatCurrency(result.recognizedCogs) : zeroCur, type: 'minus' },
      { label: t('판매자 부담 택배비', 'Seller Courier Cost'), value: result.recognizedShipping > 0 ? '-' + formatCurrency(result.recognizedShipping) : zeroCur, type: 'minus' },
      { label: t('광고비 차감 전 공헌이익', 'Pre-Ad Contribution Margin'), value: formatCurrency(result.contributionMargin), type: 'subtotal-accent' },
      { label: t('건당 광고비', 'Ad Spend per Order'), value: result.recognizedAdSpend > 0 ? '-' + formatCurrency(result.recognizedAdSpend) : zeroCur, type: 'minus' },
      {
        label: t(
          '최종 영업 추정 이익 (' + (inp.accountingBasis === 'supply_basis' ? '공급가액 기준' : '현금 기준') + ')',
          'Est. Operating Profit (' + (inp.accountingBasis === 'supply_basis' ? 'Supply Basis' : 'Cash Basis') + ')'
        ),
        value: formatCurrency(result.operatingProfit),
        type: result.operatingProfit >= 0 ? 'total-profit' : 'total-loss'
      }
    ];

    s2Rows.forEach(function (row) {
      var li = createEl('li', 'waterfall-row row-' + row.type);
      li.appendChild(createEl('span', 'wf-label', row.label));
      li.appendChild(createEl('strong', 'wf-value', row.value));
      s2List.appendChild(li);
    });
    stage2.appendChild(s2List);
    grid.appendChild(stage2);

    container.appendChild(grid);

    // [참고 영역: 예상 부가세 정산 추정]
    var taxBox = createEl('section', 'tax-reference-card');
    var taxHead = createEl('div', 'tax-ref-header');
    taxHead.appendChild(createEl('span', 'stage-pill stage-tax', t('세무 참고', 'Tax Ref.')));
    taxHead.appendChild(createEl('h3', 'waterfall-title', t('예상 부가세 정산 추정 (현금 정산·손익과 분리 표시)', 'Estimated VAT Reference (Separated from Payout & P&L)')));
    taxBox.appendChild(taxHead);

    var taxSummary = createEl('div', 'tax-summary-row');
    taxSummary.appendChild(createEl('span', 'tax-type-badge', t('적용 과세 유형: ', 'Taxpayer Type: ') + result.taxEstimate.taxpayerLabel));
    taxSummary.appendChild(createEl('strong', 'tax-amount-value', result.taxEstimate.displayAmount));
    taxBox.appendChild(taxSummary);

    if (result.taxEstimate.status === 'ok' && result.taxEstimate.taxpayerType === 'general') {
      var taxMathLine = createEl(
        'p',
        'tax-math-line',
        t('예상 매출세액 ', 'Est. Output VAT ') +
          formatCurrency(result.taxEstimate.outputVat) +
          t(' - 적격증빙 공제 매입세액 ', ' - Qualified Input VAT Credit ') +
          formatCurrency(result.taxEstimate.deductibleInputVat) +
          ' = ' +
          formatCurrency(result.taxEstimate.estimatedVatPayable)
      );
      taxBox.appendChild(taxMathLine);
    }

    var taxUl = createEl('ul', 'tax-assumption-list');
    result.taxEstimate.assumptions.forEach(function (txt) {
      taxUl.appendChild(createEl('li', '', txt));
    });
    taxUl.appendChild(createEl('li', 'tax-excluded-note', result.taxEstimate.excludedNote));
    taxBox.appendChild(taxUl);
    container.appendChild(taxBox);

    // [적용된 산식 및 회계 전제조건 보기] 아코디언
    var details = createEl('details', 'formula-details');
    var summary = createEl('summary', '', t('적용된 산식 및 회계 전제조건 보기', 'View Applied Formulas & Accounting Assumptions'));
    details.appendChild(summary);
    var detailBody = createEl('div', 'formula-body');

    var formulaLines = [
      t('1) 고객 실결제가(P_pay) = max(0, 등록 정가 - 판매자 부담 할인 - 플랫폼 쿠폰 할인) = ', '1) Customer Payment (P_pay) = max(0, List Price - Seller Discount - Platform Coupon) = ') + formatCurrency(result.customerPayment),
      t(
        '2) 판매자 귀속 매출(R_seller) = ' + (inp.platformSubsidyReimbursed ? 'max(0, 등록 정가 - 판매자 부담 할인)' : '고객 실결제가') + ' = ',
        '2) Seller Attributed Revenue (R_seller) = ' + (inp.platformSubsidyReimbursed ? 'max(0, List Price - Seller Discount)' : 'P_pay') + ' = '
      ) + formatCurrency(result.sellerProductRevenue),
      t(
        '3) 마켓 수수료 산정 기준: ' + result.feeBasisLabel + ' (기준 금액 ' + formatCurrency(result.feeBasisAmount) + ', 수수료율 ' + inp.feeRate + '%, 배송비 수수료율 ' + inp.shippingFeeRate + '%)',
        '3) Fee Basis: ' + result.feeBasisLabel + ' (Basis ' + formatCurrency(result.feeBasisAmount) + ', Fee Rate ' + inp.feeRate + '%, Shipping Fee Rate ' + inp.shippingFeeRate + '%)'
      ),
      t(
        '4) 플랫폼 정산 예정액 = 현금 매출(' + formatCurrency(result.revVat.cash) + ') - 현금 마켓 수수료(' + formatCurrency(result.feeVat.cash) + ') = ' + formatCurrency(result.platformSettlement),
        '4) Platform Settlement = Cash Revenue (' + formatCurrency(result.revVat.cash) + ') - Cash Fee (' + formatCurrency(result.feeVat.cash) + ') = ' + formatCurrency(result.platformSettlement)
      ),
      t(
        '5) 광고 전 공헌이익(C) = 기준 순매출 - 기준 원가 - 기준 수수료 - 기준 배송원가 = ' + formatCurrency(result.contributionMargin),
        '5) Pre-Ad Contribution Margin (C) = Net Revenue - COGS - Fee - Shipping Cost = ' + formatCurrency(result.contributionMargin)
      ),
      t(
        '6) VAT 전제: ' +
          (inp.accountingBasis === 'supply_basis'
            ? '공급가액 손익 기준 적용 (적격증빙 공제 가능 비용만 부가세 10% 차감 후 영업비용 반영, 불공제 비용은 부가세 포함 전액 비용 처리)'
            : 'VAT 포함 현금 기준 적용 (통장 실제 현금 유출입 기준, 공제 가능한 매입세액을 별도로 차감하지 않음)'),
        '6) VAT Premise: ' +
          (inp.accountingBasis === 'supply_basis'
            ? 'Supply-Value P&L Basis (deductible input VAT excluded from expense; non-deductible items expensed in full).'
            : 'VAT-Inclusive Cash Basis (reflects actual cash outflow/inflow without deducting creditable input VAT).')
      ),
      t(
        '7) 정밀도 원칙: 모든 중간 계산은 JavaScript IEEE 754 부동소수점 정밀도로 계산되며, 화면 표기 단계에서만 원 단위(또는 소수점 둘째 자리 %)로 반올림됩니다.',
        '7) Precision Policy: Full IEEE 754 floating-point precision is preserved internally and rounded only for final display.'
      )
    ];
    formulaLines.forEach(function (line) {
      detailBody.appendChild(createEl('p', '', line));
    });
    details.appendChild(detailBody);
    container.appendChild(details);
  }

  /**
   * 시나리오 비교 테이블 및 CSV 내보내기 렌더러
   */
  function renderScenarioTable(container, scenarios, onDelete, onExportCsv, onClearAll) {
    if (!container) return;
    clearEl(container);

    var headerRow = createEl('div', 'scenario-toolbar');
    headerRow.appendChild(
      createEl(
        'h3',
        'section-subtitle',
        t('저장된 상품 시나리오 비교 (' + scenarios.length + '건)', 'Saved Product Scenarios (' + scenarios.length + ')')
      )
    );

    var btnGroup = createEl('div', 'btn-row');
    var exportBtn = createEl('button', 'btn btn-secondary', t('CSV로 내보내기 (Excel 호환)', 'Export CSV (Excel Compatible)'));
    exportBtn.type = 'button';
    exportBtn.disabled = scenarios.length === 0;
    exportBtn.addEventListener('click', function () {
      if (typeof onExportCsv === 'function') onExportCsv(scenarios);
    });
    btnGroup.appendChild(exportBtn);

    var clearBtn = createEl('button', 'btn btn-ghost', t('전체 삭제', 'Clear All'));
    clearBtn.type = 'button';
    clearBtn.disabled = scenarios.length === 0;
    clearBtn.addEventListener('click', function () {
      if (typeof onClearAll === 'function') onClearAll();
    });
    btnGroup.appendChild(clearBtn);
    headerRow.appendChild(btnGroup);
    container.appendChild(headerRow);

    var secNote = createEl(
      'p',
      'helper-note',
      t(
        '내보내는 CSV 파일에는 UTF-8 BOM이 포함되며, 사용자 입력 문자열(상품명 등)에 대해 알려진 CSV Injection 위험을 줄이는 방어 처리(선행 수식 문자 검사 및 RFC 4180 이스케이프)가 적용됩니다.',
        'Exported CSV files include UTF-8 BOM and apply defensive escaping (formula-prefix quoting & RFC 4180 escaping) to reduce known CSV Injection risks.'
      )
    );
    container.appendChild(secNote);

    if (scenarios.length === 0) {
      container.appendChild(
        createEl(
          'p',
          'empty-state',
          t(
            '아직 저장된 시나리오가 없습니다. 위 계산기에서 [시나리오 비교함에 저장] 버튼을 누르면 여러 상품의 마진을 나란히 비교할 수 있습니다.',
            'No saved scenarios yet. Click "Save to Scenario Table" above to compare margins side by side.'
          )
        )
      );
      return;
    }

    var wrap = createEl('div', 'table-responsive');
    var table = createEl('table', 'data-table');
    var thead = createEl('thead');
    var headTr = createEl('tr');
    var headers =
      currentLang === 'en'
        ? ['Item / Memo', 'List Price', 'Buyer Paid', 'Settlement', 'Contrib. (C)', 'Est. Profit', 'Net Margin', 'ROI', 'Basis', 'Action']
        : ['상품명/메모', '등록정가', '실결제가', '정산예정액', '공헌이익(C)', '영업추정이익', '순마진율', 'ROI', '회계기준', '관리'];
    headers.forEach(function (h) {
      headTr.appendChild(createEl('th', '', h));
    });
    thead.appendChild(headTr);
    table.appendChild(thead);

    var tbody = createEl('tbody');
    scenarios.forEach(function (sc) {
      var tr = createEl('tr');
      tr.appendChild(createEl('td', 'td-name', sc.itemName));
      tr.appendChild(createEl('td', 'num', formatCurrency(sc.listPrice)));
      tr.appendChild(createEl('td', 'num', formatCurrency(sc.customerPayment)));
      tr.appendChild(createEl('td', 'num', formatCurrency(sc.platformSettlement)));
      tr.appendChild(createEl('td', 'num', formatCurrency(sc.contributionMargin)));
      var profTd = createEl('td', sc.operatingProfit >= 0 ? 'num text-positive' : 'num text-negative', formatCurrency(sc.operatingProfit));
      tr.appendChild(profTd);
      tr.appendChild(createEl('td', 'num', sc.netMarginRate !== null && typeof sc.netMarginRate === 'number' ? formatPercent(sc.netMarginRate) : t('산출 불가 (매출 0원)', 'N/A (Zero Revenue)')));
      tr.appendChild(createEl('td', 'num', sc.roi !== null && typeof sc.roi === 'number' ? formatPercent(sc.roi) : t('산출 불가 (원가 0원)', 'N/A (Zero COGS)')));
      tr.appendChild(createEl('td', 'td-basis', sc.accountingBasisLabel));

      var actionTd = createEl('td');
      var delBtn = createEl('button', 'btn-mini-delete', t('삭제', 'Delete'));
      delBtn.type = 'button';
      delBtn.addEventListener('click', function () {
        if (typeof onDelete === 'function') onDelete(sc.id);
      });
      actionTd.appendChild(delBtn);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
  }

  function exportScenariosToCsv(scenarios, filenamePrefix) {
    var headers =
      currentLang === 'en'
        ? [
            'Saved Date',
            'Item Name',
            'List Price (KRW)',
            'Seller Discount (KRW)',
            'Platform Coupon (KRW)',
            'Customer Paid (KRW)',
            'Platform Settlement (KRW)',
            'Net Revenue (KRW)',
            'COGS (KRW)',
            'Shipping Cost (KRW)',
            'Ad Spend (KRW)',
            'Contribution Margin (KRW)',
            'Est. Operating Profit (KRW)',
            'Net Margin (%)',
            'ROI (%)',
            'Accounting Basis'
          ]
        : [
            '저장일',
            '상품명',
            '등록정가(원)',
            '판매자부담할인(원)',
            '플랫폼쿠폰할인(원)',
            '고객실결제가(원)',
            '플랫폼정산예정액(원)',
            '기준순매출(원)',
            '기준원가(원)',
            '기준배송원가(원)',
            '기준광고비(원)',
            '광고전공헌이익(원)',
            '영업추정이익(원)',
            '순마진율(%)',
            'ROI(%)',
            '회계기준'
          ];
    var rows = [headers];

    scenarios.forEach(function (sc) {
      rows.push([
        { value: sc.createdAt || '', numeric: false },
        { value: sc.itemName || '', numeric: false },
        { value: sc.listPrice, numeric: true },
        { value: sc.sellerDiscount, numeric: true },
        { value: sc.platformDiscount, numeric: true },
        { value: sc.customerPayment, numeric: true },
        { value: sc.platformSettlement, numeric: true },
        { value: sc.recognizedRevenue, numeric: true },
        { value: sc.recognizedCogs, numeric: true },
        { value: sc.recognizedShipping, numeric: true },
        { value: sc.recognizedAdSpend, numeric: true },
        { value: sc.contributionMargin, numeric: true },
        { value: sc.operatingProfit, numeric: true },
        sc.netMarginRate !== null ? { value: sc.netMarginRate, numeric: true } : { value: sc.netMarginLabel, numeric: false },
        sc.roi !== null ? { value: sc.roi, numeric: true } : { value: sc.roiLabel, numeric: false },
        { value: sc.accountingBasisLabel || '', numeric: false }
      ]);
    });

    var fname = (filenamePrefix || 'seller-math-scenarios') + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    return downloadCsv(fname, rows);
  }

  /**
   * 공용 다국어(KO/EN) 번역 사전 및 XSS-안전 DOM 번역 엔진
   */
  var COMMON_I18N_MAP = {
    '쇼핑몰 셀러 정산·마진·ROAS 통합 회계 엔진': 'Seller Settlement, Margin & ROAS Calculator',
    '쇼핑몰 정산 · 마진 · ROAS 계산기': 'Seller Settlement, Margin & ROAS Calculator',
    '종합 대시보드': 'Dashboard',
    '순이익·정산 계산기': 'Profit & Settlement',
    '손익분기 ROAS': 'Break-Even ROAS',
    '판매가 역산기': 'Price Calculator',
    '약관·개인정보·면책': 'Legal & Privacy',
    '순이익 계산기': 'Profit Calculator',
    'ROAS 계산기': 'ROAS Calculator',
    '개인정보처리방침·이용약관·면책고지': 'Privacy, Terms & Disclaimer',
    '광고 영역 (승인 후 애드센스 / 애드핏 배너 코드 삽입 위치 · CLS 방지 높이 확보)': 'Ad Slot (Reserved min-height to prevent CLS for AdSense / AdFit)',
    '광고 영역 (승인 후 애드센스 반응형 / 애드핏 코드 삽입 위치 · CLS 방지)': 'In-Content Ad Slot (Reserved min-height to prevent CLS)',
    '기본값(30,000원)': 'Reset (30,000 KRW)',
    '기본값(목표 8,000원)': 'Reset (8,000 KRW Target)',
    '1. 상품 가격 및 쿠폰 부담': '1. Price & Coupon Funding',
    '상품명 / 메모 (시나리오 저장용)': 'Item Name / Memo (for Scenarios)',
    '상품명 / 메모': 'Item Name / Memo',
    '상품명 / 캠페인명': 'Item / Campaign Name',
    '등록 정가 (원)': 'List Price (KRW)',
    '판매자 부담 할인액 (원)': 'Seller-Funded Discount (KRW)',
    '플랫폼 부담 쿠폰 (원)': 'Platform-Funded Coupon (KRW)',
    '플랫폼 쿠폰 지원금을 정산 시 판매자에게 보전함': 'Platform reimburses its coupon amount upon settlement',
    '2. 매입 원가 · 배송비 · 마켓 수수료': '2. COGS, Shipping & Marketplace Fees',
    '2. 원가 · 배송비 · 마켓 수수료': '2. COGS, Shipping & Marketplace Fees',
    '3. 매입 원가 · 수수료 · 배송비 · 광고비': '3. COGS, Fees, Shipping & Ad Spend',
    '상품 매입 원가 COGS (원)': 'Product Cost / COGS (KRW)',
    '수수료 부과 기준': 'Marketplace Fee Basis',
    '① 판매자 귀속 상품 매출 비례': '1. Seller Attributed Revenue',
    '② 고객 실결제가 비례': '2. Customer Paid Amount',
    '③ 배송비 포함 결제금액 비례': '3. Payment Incl. Shipping',
    '④ 직접 입력 수수료 기준': '4. Custom Fee Basis',
    '마켓 판매 수수료율 (%)': 'Marketplace Fee Rate (%)',
    '배송비 별도 수수료율 (%)': 'Shipping Fee Rate (%)',
    '직접 입력 방식': 'Custom Fee Input Mode',
    '고정 수수료 금액 (원)': 'Fixed Fee Amount (KRW)',
    '직접 기준금액 × 수수료율(%)': 'Custom Basis Amount × Fee Rate (%)',
    '직접 수수료 금액 / 기준금액 (원)': 'Custom Fee / Basis Amount (KRW)',
    '직접 입력 수수료 기준금액 (원)': 'Custom Fee Basis Amount (KRW)',
    '고객 결제 배송비 (원)': 'Customer Shipping Paid (KRW)',
    '판매자 실부담 택배 원가 (원)': 'Actual Seller Courier Cost (KRW)',
    '건당 광고비 (원)': 'Ad Spend per Order (KRW)',
    '예상 건당 광고비 (원)': 'Est. Ad Spend per Order (KRW)',
    '일일 예상 판매량 (건)': 'Est. Daily Orders',
    '월 영업일수 (일)': 'Operating Days / Month',
    '고급 설정 (VAT 포함/공급가액 손익 기준 · 매입세액 공제 · 과세유형)': 'Advanced Settings (VAT Cash vs Supply Basis, Input Tax Credits & Taxpayer Type)',
    '손익 계산 회계 기준': 'P&L Accounting Basis',
    'VAT 포함 현금 기준 (실제 통장 입출금)': 'VAT-Inclusive Cash Basis (Actual Cash Flow)',
    '공급가액 손익 기준 (공제 가능 부가세 제외)': 'Supply-Value P&L Basis (Deductible Input VAT Excluded)',
    '공급가액 손익 기준 선택 시 적격증빙 공제 가능 항목의 부가세 10%는 영업비용에서 중복 차감하지 않습니다.': 'In Supply-Value Basis, creditable 10% input VAT is excluded from operating expenses.',
    '사업자 과세 유형 (참고용 부가세 추정)': 'Taxpayer Type (For VAT Reference Estimate)',
    '사업자 과세 유형': 'Taxpayer Type',
    '일반과세자': 'General Taxpayer (10% VAT)',
    '간이과세자': 'Simplified Taxpayer',
    '면세사업자': 'VAT-Exempt Business',
    '간이과세 업종별 부가가치율 (%)': 'Simplified Taxpayer Value-Added Rate (%)',
    '미선택 (필수 입력 전 계산 보류)': 'Not Selected (Calculation Pending)',
    '소매업·전기/가스/증기 (15%)': 'Retail / Utilities (15%)',
    '제조업·농임어업·소화물운송 (20%)': 'Manufacturing / Parcel Delivery (20%)',
    '건설업·부동산임대 (25%)': 'Construction / Real Estate Rental (25%)',
    '음식점업·숙박업·운수창고통신 (30%)': 'F&B / Lodging / Logistics & Telecom (30%)',
    '기타 서비스업 (40%)': 'Other Services (40%)',
    '세금계산서 매입 공제율 (%)': 'Tax Invoice Credit Rate (%)',
    '항목': 'Item',
    'VAT(10%) 포함 입력': 'Entered Incl. 10% VAT',
    '적격증빙 매입세액 공제': 'Qualified VAT Credit',
    '매출(판매가·배송비)': 'Revenue (Price & Shipping)',
    '매출세액 기준': 'Output VAT Basis',
    '상품 원가 (COGS)': 'Product Cost (COGS)',
    '마켓 수수료': 'Marketplace Fee',
    '판매자 택배 원가': 'Seller Courier Cost',
    '건당 광고비': 'Ad Spend per Order',
    '시나리오 비교함에 저장': 'Save to Scenario Table',
    '계산 요약 복사': 'Copy Summary',
    '인쇄 / PDF 저장': 'Print / Save PDF',
    '자주 묻는 질문 (FAQ)': 'Frequently Asked Questions (FAQ)',
    'SELLER MATH — 쇼핑몰 셀러 정산·마진·ROAS·판매가 역산 무료 웹 도구': 'SELLER MATH — Free Seller Profit, Settlement, ROAS & Pricing Tool'
  };

  var COMMON_PLACEHOLDER_MAP = {
    '예: 여름 린넨 셔츠': 'e.g., Summer Linen Shirt',
    '예: 여름 린넨 셔츠 메타캠페인': 'e.g., Linen Shirt Meta Ad Campaign',
    '예: 2026 신상 니트 가디건': 'e.g., 2026 Knit Cardigan'
  };

  var leafSnapshotMap = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var richSnapshotMap = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var activePageDict = {};
  var activePageTitles = { ko: '', en: '' };
  var langButtonRef = null;

  function applyDomTranslations() {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = currentLang;

    if (!activePageTitles.ko && document.title) {
      activePageTitles.ko = document.title;
    }
    if (currentLang === 'en' && activePageTitles.en) {
      document.title = activePageTitles.en;
    } else if (currentLang === 'ko' && activePageTitles.ko) {
      document.title = activePageTitles.ko;
    }

    if (langButtonRef) {
      langButtonRef.textContent = currentLang === 'en' ? '🌐 한국어' : '🌐 EN';
      langButtonRef.setAttribute(
        'aria-label',
        currentLang === 'en' ? '한국어로 전환' : 'Switch to English'
      );
    }

    // 1. Rich / explicit data-i18n-en elements (snapshot original Korean children safely)
    var richNodes = document.querySelectorAll('[data-i18n-en]');
    for (var i = 0; i < richNodes.length; i++) {
      var rNode = richNodes[i];
      if (richSnapshotMap && !richSnapshotMap.has(rNode)) {
        richSnapshotMap.set(rNode, rNode.cloneNode(true));
      }
      if (currentLang === 'en') {
        rNode.textContent = rNode.getAttribute('data-i18n-en');
      } else if (richSnapshotMap && richSnapshotMap.has(rNode)) {
        var origClone = richSnapshotMap.get(rNode).cloneNode(true);
        clearEl(rNode);
        while (origClone.firstChild) {
          rNode.appendChild(origClone.firstChild);
        }
      }
    }

    // 2. Leaf text elements via dictionary
    var candidates = document.querySelectorAll('h1, h2, h3, p, a, span, strong, label, button, summary, th, td, li, option, .form-section-label');
    for (var j = 0; j < candidates.length; j++) {
      var el = candidates[j];
      if (el.hasAttribute('data-i18n-en') || el.classList.contains('lang-switch-btn')) continue;
      if (el.children.length > 0) continue;

      if (leafSnapshotMap && !leafSnapshotMap.has(el)) {
        leafSnapshotMap.set(el, el.textContent);
      }
      var origText = leafSnapshotMap ? leafSnapshotMap.get(el) : el.textContent;
      var norm = origText.replace(/\s+/g, ' ').trim();
      if (!norm) continue;

      if (currentLang === 'en') {
        var translated = activePageDict[norm] || COMMON_I18N_MAP[norm];
        if (translated) {
          el.textContent = translated;
        }
      } else {
        el.textContent = origText;
      }
    }

    // 3. Input placeholders
    var inputs = document.querySelectorAll('input[placeholder]');
    for (var k = 0; k < inputs.length; k++) {
      var inpEl = inputs[k];
      if (!inpEl.dataset.koPlaceholder) {
        inpEl.dataset.koPlaceholder = inpEl.getAttribute('placeholder');
      }
      var koPh = inpEl.dataset.koPlaceholder;
      if (currentLang === 'en') {
        inpEl.setAttribute('placeholder', activePageDict[koPh] || COMMON_PLACEHOLDER_MAP[koPh] || koPh);
      } else {
        inpEl.setAttribute('placeholder', koPh);
      }
    }
  }

  function setLang(lang) {
    var next = lang === 'en' ? 'en' : 'ko';
    currentLang = next;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY_LANG, next);
      }
    } catch (e) {
      // ignore blocked storage
    }
    if (typeof document !== 'undefined') {
      applyDomTranslations();
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('sellermath:langchange', { detail: { lang: next } }));
      }
    }
    return next;
  }

  function initI18n(pageDict, pageEnTitle) {
    activePageDict = pageDict || {};
    if (pageEnTitle) activePageTitles.en = pageEnTitle;
    if (typeof document === 'undefined') return;

    var headerInner = document.querySelector('.header-inner');
    if (headerInner && !headerInner.querySelector('.lang-switch-btn')) {
      var btn = createEl('button', 'lang-switch-btn', currentLang === 'en' ? '🌐 한국어' : '🌐 EN');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        setLang(currentLang === 'en' ? 'ko' : 'en');
      });
      headerInner.appendChild(btn);
      langButtonRef = btn;
    } else if (headerInner) {
      langButtonRef = headerInner.querySelector('.lang-switch-btn');
    }

    applyDomTranslations();
  }

  return {
    DEFAULT_INPUTS: DEFAULT_INPUTS,
    FEE_BASIS_LABELS: FEE_BASIS_LABELS,
    AD_REVENUE_BASIS_LABELS: AD_REVENUE_BASIS_LABELS,
    TAXPAYER_LABELS: TAXPAYER_LABELS,
    getLang: getLang,
    setLang: setLang,
    t: t,
    initI18n: initI18n,
    cloneDefaults: cloneDefaults,
    normalizeInputs: normalizeInputs,
    calculateProfit: calculateProfit,
    calculateRoas: calculateRoas,
    calculateReversePrice: calculateReversePrice,
    formatCurrency: formatCurrency,
    formatNumber: formatNumber,
    formatPercent: formatPercent,
    escapeCsvCell: escapeCsvCell,
    buildCsvContent: buildCsvContent,
    downloadCsv: downloadCsv,
    exportScenariosToCsv: exportScenariosToCsv,
    loadSharedInputs: loadSharedInputs,
    saveSharedInputs: saveSharedInputs,
    loadScenarios: loadScenarios,
    saveScenario: saveScenario,
    deleteScenario: deleteScenario,
    clearScenarios: clearScenarios,
    copyTextToClipboard: copyTextToClipboard,
    createEl: createEl,
    clearEl: clearEl,
    renderWaterfallBreakdown: renderWaterfallBreakdown,
    renderScenarioTable: renderScenarioTable
  };
});
