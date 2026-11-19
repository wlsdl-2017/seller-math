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
   * 비용 항목 VAT 분해 및 매입세액 공제 처리 헬퍼 (면세사업자 매입부가세 불공제·전액 비용화 포함)
   */
  function splitVatCost(amount, vatIncluded, vatDeductible, accountingBasis, taxpayerType) {
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
    var effectiveDeductible = taxpayerType === 'exempt' ? false : Boolean(vatDeductible);
    var deductibleVat = effectiveDeductible ? vat : 0;
    var recognized;
    if (taxpayerType === 'exempt') {
      // 면세사업자는 매입세액 공제·환급이 불가하므로 VAT 포함 현금 지출액 전액을 원가·필요경비로 산입
      recognized = cash;
    } else if (accountingBasis === 'supply_basis') {
      // 적격증빙 매입세액 공제가 가능한 비용만 공급가액 기준(부가세 제외), 불공제 비용은 부가세 포함 전액 비용 처리
      recognized = effectiveDeductible ? supply : cash;
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
      vatDeductible: effectiveDeductible,
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
      var rawSimplifiedCredit = qualifiedCashTotal * creditRate;
      var simplifiedCredit = Math.min(simplifiedGrossVat, rawSimplifiedCredit);
      var simplifiedNetVat = Math.max(0, simplifiedGrossVat - simplifiedCredit);
      var simpCardCredit = Math.min(simplifiedNetVat, revVat.cash * 0.013);
      var simpNetAfterCard = Math.max(0, simplifiedNetVat - simpCardCredit);

      return {
        taxpayerType: 'simplified',
        taxpayerLabel: getTaxpayerLabel('simplified'),
        status: 'ok',
        outputVat: simplifiedGrossVat,
        deductibleInputVat: simplifiedCredit,
        estimatedVatPayable: simplifiedNetVat,
        cardIssuanceCredit: simpCardCredit,
        netVatAfterCardCredit: simpNetAfterCard,
        displayAmount: formatCurrency(simplifiedNetVat),
        assumptions: [
          t(
            '적용 기준: 공급대가(VAT 포함 매출) × 10% × 업종별 부가가치율(' + inp.simplifiedValueAddedRate + '%)',
            'Applied Basis: Gross Revenue × 10% × Industry Value-Added Rate (' + inp.simplifiedValueAddedRate + '%)'
          ),
          t(
            '공제 기준: 적격증빙 공제 가능 항목(' + (deductibleNames.length ? deductibleNames.join(', ') : '없음') + ') 매입대가 × ' + inp.simplifiedInputCreditRate + '% (매출세액 한도 내 비환급)',
            'Credit Basis: Qualified items (' + (deductibleNames.length ? deductibleNames.join(', ') : 'None') + ') × ' + inp.simplifiedInputCreditRate + '% (Non-refundable)'
          ),
          t(
            '참고(부가가치세법 제46조): 카드·PG 매출 1.3%(연 1,000만원 한도) 발행세액공제 최대 ' + formatCurrency(simpCardCredit) + ' 반영 시 예상 납부세액 ' + formatCurrency(simpNetAfterCard),
            'Ref (Art. 46): With 1.3% card/PG tax credit up to ' + formatCurrency(simpCardCredit) + ', est. VAT drops to ' + formatCurrency(simpNetAfterCard)
          ),
          t(
            '불공제 처리 항목: ' + (nonDeductibleNames.length ? nonDeductibleNames.join(', ') : '없음'),
            'Non-deductible items: ' + (nonDeductibleNames.length ? nonDeductibleNames.join(', ') : 'None')
          )
        ],
        excludedNote: t(
          '2024.7.1. 시행 기준 간이과세 적용(연 1억 400만 원 미만) 및 납부의무 면제(연 4,800만 원 미만) 여부는 [세무·과세 진단기]에서 연간 매출 기준으로 판정할 수 있습니다.',
          'Annual simplified eligibility (<104M KRW) and payment exemption (<48M KRW) can be evaluated in the Korean Tax Guide.'
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
    var generalCardCredit = estimatedVatPayable > 0 ? Math.min(estimatedVatPayable, revVat.cash * 0.013) : 0;
    var generalNetAfterCard = estimatedVatPayable > 0 ? Math.max(0, estimatedVatPayable - generalCardCredit) : estimatedVatPayable;

    return {
      taxpayerType: 'general',
      taxpayerLabel: getTaxpayerLabel('general'),
      status: 'ok',
      outputVat: outputVat,
      deductibleInputVat: deductibleInputVat,
      estimatedVatPayable: estimatedVatPayable,
      cardIssuanceCredit: generalCardCredit,
      netVatAfterCardCredit: generalNetAfterCard,
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
          '참고(부가가치세법 제46조): 개인사업자 카드·PG 매출 1.3%(연 1,000만원 한도) 발행세액공제 최대 ' + formatCurrency(generalCardCredit) + ' 적용 시 ' + formatCurrency(Math.max(0, generalNetAfterCard)),
          'Ref (Art. 46): Sole proprietors with <=1B KRW prior-year supply receive 1.3% card credit up to ' + formatCurrency(generalCardCredit)
        ),
        t(
          '매입세액 공제 제외(불공제) 항목: ' + (nonDeductibleNames.length ? nonDeductibleNames.join(', ') : '없음'),
          'Non-deductible items: ' + (nonDeductibleNames.length ? nonDeductibleNames.join(', ') : 'None')
        )
      ],
      excludedNote: t(
        '종합소득세, 4대 보험, 연 매출 10억 원 초과 사업자의 카드발행세액공제 제외 여부는 [세무·과세 진단기] 메뉴에서 통합 진단할 수 있습니다.',
        'Comprehensive income tax and the 1B KRW card credit cap are evaluated in the Korean Tax Guide page.'
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

    // 3. VAT 분리 (현금 기준 vs 공급가액/간이과세/면세 세법 반영 손익 기준)
    var revVat = splitVatRevenue(totalGrossRevenueInput, inp.revenueVatIncluded, inp.accountingBasis, inp.taxpayerType);
    var feeVat = splitVatCost(feeTotalInput, inp.feeVatIncluded, inp.feeVatDeductible, inp.accountingBasis, inp.taxpayerType);
    var cogsVat = splitVatCost(inp.cogs, inp.cogsVatIncluded, inp.cogsVatDeductible, inp.accountingBasis, inp.taxpayerType);
    var shipVat = splitVatCost(inp.sellerShippingCost, inp.shippingVatIncluded, inp.shippingVatDeductible, inp.accountingBasis, inp.taxpayerType);
    var adVat = splitVatCost(inp.adSpend, inp.adVatIncluded, inp.adVatDeductible, inp.accountingBasis, inp.taxpayerType);

    // 4. 1단계: 플랫폼 정산 예정액 (실제 통장 입금 예정액, VAT 포함 현금 정산 기준)
    var platformSettlement = revVat.cash - feeVat.cash;

    // 5. 2단계: 선택된 회계·과세 기준에 따른 공헌이익(C) 및 최종 영업 추정 이익
    var recognizedRevenue = revVat.recognized;
    var recognizedFee = feeVat.recognized;
    var recognizedCogs = cogsVat.recognized;
    var recognizedShipping = shipVat.recognized;
    var recognizedAdSpend = adVat.recognized;

    if (inp.taxpayerType === 'simplified' && inp.accountingBasis === 'supply_basis') {
      if (inp.simplifiedValueAddedRate !== null && inp.simplifiedValueAddedRate > 0) {
        // 간이과세자 실효 세법 반영: 매출세액(공급대가 × 업종부가가치율 × 10%), 매입공제(적격증빙 매입대가 × 공제율, 비환급)
        var simpOutVat = revVat.cash * VAT_RATE * (inp.simplifiedValueAddedRate / 100);
        var simpCreditRate = inp.simplifiedInputCreditRate / 100;
        var rawFeeCr = feeVat.vatDeductible ? feeVat.cash * simpCreditRate : 0;
        var rawCogsCr = cogsVat.vatDeductible ? cogsVat.cash * simpCreditRate : 0;
        var rawShipCr = shipVat.vatDeductible ? shipVat.cash * simpCreditRate : 0;
        var rawAdCr = adVat.vatDeductible ? adVat.cash * simpCreditRate : 0;
        var totalRawCr = rawFeeCr + rawCogsCr + rawShipCr + rawAdCr;
        var crScale = totalRawCr > EPSILON ? Math.min(1, simpOutVat / totalRawCr) : 0;

        recognizedRevenue = revVat.cash - simpOutVat;
        recognizedFee = feeVat.cash - rawFeeCr * crScale;
        recognizedCogs = cogsVat.cash - rawCogsCr * crScale;
        recognizedShipping = shipVat.cash - rawShipCr * crScale;
        recognizedAdSpend = adVat.cash - rawAdCr * crScale;
      } else {
        // 간이과세 부가가치율 미선택 시에는 현금 지출액(VAT 포함)과 동일하게 유지
        recognizedRevenue = revVat.cash;
        recognizedFee = feeVat.cash;
        recognizedCogs = cogsVat.cash;
        recognizedShipping = shipVat.cash;
        recognizedAdSpend = adVat.cash;
      }
    }

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
    '세무·과세 진단기': 'Tax & Filing Guide',
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
    '소매업(전자상거래)·음식점업·재생용 재료수집 (15%)': 'E-Commerce / Retail / Restaurants (15%)',
    '제조업(최종소비자 상대)·농임어업·소화물운송 (20%)': 'B2C Manufacturing / Agriculture / Parcel Delivery (20%)',
    '숙박업 (25%)': 'Lodging & Hospitality (25%)',
    '건설업·운수창고업·정보통신업 (30%)': 'Construction / Logistics & Warehousing / IT (30%)',
    '부동산임대업·전문과학기술·사업지원·기타서비스 (40%)': 'Real Estate Rental / Professional & Other Services (40%)',
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
    '계산 링크 복사': 'Copy Share Link',
    '리포트 이미지(PNG) 저장': 'Save Report Card (PNG)',
    '세무 리포트 이미지(PNG) 저장': 'Save Tax Report (PNG)',
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

  /* ==========================================================================
     엑셀(.xlsx / .csv / .tsv) & 표 붙여넣기 일괄 마진·정산 계산 엔진 (100% 브라우저 로컬)
     ========================================================================== */

  var BULK_FIELD_SPECS = [
    { key: 'itemName', ko: '상품명', en: 'Product Name', keywords: ['상품명', '품목명', '품목', '옵션명', '제품명', '주문상품', '아이템', '상품', 'productname', 'itemname', 'product', 'item', 'sku', 'title', 'name'] },
    { key: 'listPrice', ko: '정상가/판매가', en: 'Selling Price', keywords: ['판매단가', '정상가', '판매가', '소비자가', '정가', '결제금액', '매출액', '단가', 'sellingprice', 'saleprice', 'listprice', 'unitprice', 'price', 'revenue'] },
    { key: 'cogs', ko: '매입원가', en: 'COGS (Unit Cost)', keywords: ['매입원가', '공급원가', '제품원가', '사입원가', '도매가', '사입가', '매입가', '공급가', '원가', 'unitcost', 'wholesale', 'cogs', 'cost'] },
    { key: 'feeRate', ko: '수수료 (% 또는 원)', en: 'Fee (% or Fixed)', keywords: ['마켓수수료', '판매수수료', '플랫폼수수료', '수수료율', '수수료', 'commissionrate', 'referralfee', 'feerate', 'commission', 'fee'] },
    { key: 'sellerDiscount', ko: '판매자할인', en: 'Seller Discount', keywords: ['판매자부담할인', '판매자할인', '즉시할인', '자사쿠폰', '판매자쿠폰', '할인금액', '할인', 'sellerdiscount', 'discount', 'coupon'] },
    { key: 'platformDiscount', ko: '플랫폼할인', en: 'Platform Discount', keywords: ['플랫폼할인', '마켓지원할인', '네이버지원할인', '플랫폼쿠폰', '지원할인', 'platformdiscount', 'marketdiscount'] },
    { key: 'sellerShippingCost', ko: '실택배비(원가)', en: 'Seller Shipping Cost', keywords: ['판매자배송비', '출고배송비', '실택배비', '택배비', '배송원가', '물류비', '포장배송비', '포장비', '운임', 'shippingcost', 'fulfillment', 'freight'] },
    { key: 'customerShipping', ko: '고객부담배송비', en: 'Customer Shipping', keywords: ['고객부담배송비', '고객결제배송비', '고객배송비', '수취배송비', '유료배송비', '결제배송비', 'customershipping', 'shippingcharged', 'deliveryfee'] },
    { key: 'adSpend', ko: '광고비(건당)', en: 'Ad Spend (Per Unit)', keywords: ['건당광고비', '지출광고비', '광고소진액', '집행광고비', '마케팅비', '광고비', 'adspend', 'adcost', 'marketing', 'ads'] },
    { key: 'quantity', ko: '판매수량', en: 'Quantity', keywords: ['판매수량', '주문수량', '판매건수', '수량', '건수', '개수', 'quantity', 'qty', 'units', 'orders', 'count'] }
  ];

  function normalizeHeaderToken(text) {
    return String(text || '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[\s_\-:/\\%₩$,.]/g, '')
      .toLowerCase();
  }

  function detectDelimiter(text) {
    var lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var tabCount = 0;
    var commaCount = 0;
    var scanned = 0;

    for (var i = 0; i < lines.length && scanned < 4; i++) {
      var line = lines[i];
      if (!line || !line.trim()) continue;
      scanned += 1;
      var inQuotes = false;
      for (var c = 0; c < line.length; c++) {
        var ch = line.charAt(c);
        if (ch === '"') {
          if (inQuotes && c + 1 < line.length && line.charAt(c + 1) === '"') {
            c += 1;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (!inQuotes) {
          if (ch === '\t') tabCount += 1;
          else if (ch === ',') commaCount += 1;
        }
      }
    }

    if (tabCount > 0 && tabCount >= commaCount) return '\t';
    if (tabCount > 0 && scanned === 1) return '\t';
    return ',';
  }

  function parseDelimitedText(text) {
    var src = String(text || '').replace(/^\uFEFF/, '');
    if (!src.trim()) return [];

    var delimiter = detectDelimiter(src);
    var rows = [];
    var currentRow = [];
    var currentCell = '';
    var inQuotes = false;

    for (var i = 0; i < src.length; i++) {
      var ch = src.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < src.length && src.charAt(i + 1) === '"') {
            currentCell += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          currentCell += ch;
        }
      } else {
        if (ch === '"' && currentCell.trim() === '') {
          inQuotes = true;
          currentCell = '';
        } else if (ch === delimiter) {
          currentRow.push(currentCell.trim());
          currentCell = '';
        } else if (ch === '\r') {
          if (i + 1 < src.length && src.charAt(i + 1) === '\n') {
            i += 1;
          }
          currentRow.push(currentCell.trim());
          if (!isRowEmpty(currentRow)) rows.push(currentRow);
          currentRow = [];
          currentCell = '';
        } else if (ch === '\n') {
          currentRow.push(currentCell.trim());
          if (!isRowEmpty(currentRow)) rows.push(currentRow);
          currentRow = [];
          currentCell = '';
        } else {
          currentCell += ch;
        }
      }
    }

    currentRow.push(currentCell.trim());
    if (!isRowEmpty(currentRow)) rows.push(currentRow);

    return rows;
  }

  function isRowEmpty(row) {
    if (!Array.isArray(row) || row.length === 0) return true;
    for (var i = 0; i < row.length; i++) {
      if (String(row[i] || '').trim() !== '') return false;
    }
    return true;
  }

  function detectColumnMapping(headers) {
    var mapping = {};
    for (var s = 0; s < BULK_FIELD_SPECS.length; s++) {
      mapping[BULK_FIELD_SPECS[s].key] = -1;
    }
    if (!Array.isArray(headers) || headers.length === 0) return mapping;

    var normalizedHeaders = headers.map(normalizeHeaderToken);
    var candidates = [];

    for (var f = 0; f < BULK_FIELD_SPECS.length; f++) {
      var spec = BULK_FIELD_SPECS[f];
      for (var c = 0; c < normalizedHeaders.length; c++) {
        var token = normalizedHeaders[c];
        if (!token) continue;
        var bestScore = 0;
        for (var k = 0; k < spec.keywords.length; k++) {
          var kw = spec.keywords[k];
          if (token === kw) {
            bestScore = Math.max(bestScore, 1000 + kw.length * 10 - k);
          } else if (token.indexOf(kw) !== -1) {
            bestScore = Math.max(bestScore, 400 + kw.length * 10 - k);
          } else if (kw.length >= 4 && kw.indexOf(token) !== -1 && token.length >= 3) {
            bestScore = Math.max(bestScore, 150 + token.length * 5);
          }
        }
        if (bestScore > 0) {
          candidates.push({ fieldKey: spec.key, colIdx: c, score: bestScore, fieldOrder: f });
        }
      }
    }

    candidates.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.fieldOrder - b.fieldOrder;
    });

    var usedCols = {};
    for (var m = 0; m < candidates.length; m++) {
      var cand = candidates[m];
      if (mapping[cand.fieldKey] === -1 && !usedCols[cand.colIdx]) {
        mapping[cand.fieldKey] = cand.colIdx;
        usedCols[cand.colIdx] = true;
      }
    }

    return mapping;
  }

  function countMappedFields(mapping) {
    var count = 0;
    var keys = Object.keys(mapping);
    for (var i = 0; i < keys.length; i++) {
      if (mapping[keys[i]] >= 0) count += 1;
    }
    return count;
  }

  function findBestHeaderRow(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { headerRowIndex: -1, headers: [], dataRows: [], mapping: detectColumnMapping([]) };
    }

    var scanLimit = Math.min(rows.length, 6);
    var bestIdx = 0;
    var bestScore = -1;
    var bestMapping = detectColumnMapping(rows[0]);

    for (var i = 0; i < scanLimit; i++) {
      var candidateMapping = detectColumnMapping(rows[i]);
      var mappedCount = countMappedFields(candidateMapping);
      var keyBonus = (candidateMapping.listPrice >= 0 ? 2 : 0) + (candidateMapping.cogs >= 0 ? 2 : 0);
      var totalScore = mappedCount * 10 + keyBonus;
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestIdx = i;
        bestMapping = candidateMapping;
      }
    }

    return {
      headerRowIndex: bestIdx,
      headers: rows[bestIdx] || [],
      dataRows: rows.slice(bestIdx + 1),
      mapping: bestMapping
    };
  }

  function parseNumericCell(rawVal) {
    if (typeof rawVal === 'number') {
      return Number.isFinite(rawVal) ? rawVal : NaN;
    }
    var str = String(rawVal || '').trim();
    if (!str) return NaN;

    var isParenNeg = /^\(.*\)$/.test(str);
    var cleaned = str
      .replace(/^\((.*)\)$/, '$1')
      .replace(/[,₩$%\s]/g, '')
      .replace(/(원|개|건|ea|krw|usd)$/gi, '')
      .trim();

    if (!cleaned || cleaned === '-') return NaN;
    var num = Number(cleaned);
    if (!Number.isFinite(num)) return NaN;
    return isParenNeg ? -num : num;
  }

  function computeBatchRows(dataRows, mapping, baseInputs) {
    var base = normalizeInputs(baseInputs || cloneDefaults());
    var map = mapping || {};
    var results = [];
    var skippedCount = 0;

    var totalUnits = 0;
    var totalCustomerPayment = 0;
    var totalRecognizedRevenue = 0;
    var totalSettlement = 0;
    var totalOperatingProfit = 0;
    var totalAdSpend = 0;
    var lossCount = 0;

    if (!Array.isArray(dataRows)) {
      dataRows = [];
    }

    for (var r = 0; r < dataRows.length; r++) {
      var row = dataRows[r];
      if (isRowEmpty(row)) continue;

      var itemNameRaw = map.itemName >= 0 ? String(row[map.itemName] || '').trim() : '';
      var priceRaw = map.listPrice >= 0 ? parseNumericCell(row[map.listPrice]) : NaN;
      var cogsRaw = map.cogs >= 0 ? parseNumericCell(row[map.cogs]) : NaN;

      // 판매가 컬럼이 매핑된 경우 숫자가 비어있으면 소계/구분선 등으로 간주하고 건너뜀
      if (map.listPrice >= 0 && Number.isNaN(priceRaw) && Number.isNaN(cogsRaw)) {
        skippedCount += 1;
        continue;
      }

      var rowInputs = Object.assign({}, base);
      rowInputs.itemName = itemNameRaw || t('상품 #' + (results.length + 1), 'Item #' + (results.length + 1));

      if (map.listPrice >= 0 && !Number.isNaN(priceRaw)) {
        rowInputs.listPrice = Math.max(0, priceRaw);
      }
      if (map.cogs >= 0) {
        rowInputs.cogs = Number.isNaN(cogsRaw) ? 0 : Math.max(0, cogsRaw);
      }
      if (map.sellerDiscount >= 0) {
        var sd = parseNumericCell(row[map.sellerDiscount]);
        rowInputs.sellerDiscountType = 'fixed';
        rowInputs.sellerDiscount = Number.isNaN(sd) ? 0 : Math.max(0, sd);
      }
      if (map.platformDiscount >= 0) {
        var pd = parseNumericCell(row[map.platformDiscount]);
        rowInputs.platformDiscountType = 'fixed';
        rowInputs.platformDiscount = Number.isNaN(pd) ? 0 : Math.max(0, pd);
      }
      if (map.sellerShippingCost >= 0) {
        var sc = parseNumericCell(row[map.sellerShippingCost]);
        rowInputs.sellerShippingCost = Number.isNaN(sc) ? 0 : Math.max(0, sc);
      }
      if (map.customerShipping >= 0) {
        var cs = parseNumericCell(row[map.customerShipping]);
        rowInputs.customerShipping = Number.isNaN(cs) ? 0 : Math.max(0, cs);
      }
      if (map.adSpend >= 0) {
        var ad = parseNumericCell(row[map.adSpend]);
        rowInputs.adSpend = Number.isNaN(ad) ? 0 : Math.max(0, ad);
      }
      if (map.feeRate >= 0) {
        var feeVal = parseNumericCell(row[map.feeRate]);
        var cleanFee = Number.isNaN(feeVal) ? 0 : Math.max(0, feeVal);
        if (cleanFee > 100) {
          // 100 초과 값은 비율(%)이 아닌 건당 정액 수수료(원)로 자동 전환 처리
          rowInputs.feeBasisMode = 'custom_basis';
          rowInputs.customFeeMode = 'fixed_fee';
          rowInputs.customFeeBase = cleanFee;
          rowInputs.feeRate = 0;
        } else {
          if (rowInputs.feeBasisMode === 'custom_basis' && rowInputs.customFeeMode === 'fixed_fee') {
            rowInputs.feeBasisMode = 'seller_revenue';
          }
          rowInputs.feeRate = cleanFee;
        }
      }

      var qty = 1;
      if (map.quantity >= 0) {
        var q = parseNumericCell(row[map.quantity]);
        qty = !Number.isNaN(q) && q > 0 ? q : 1;
      }

      var profitRes = calculateProfit(rowInputs);
      var roasRes = calculateRoas(rowInputs);
      var isLoss = profitRes.operatingProfit < -EPSILON;
      if (isLoss) lossCount += 1;

      var rowTotalPayment = profitRes.customerPayment * qty;
      var rowTotalSettlement = profitRes.platformSettlement * qty;
      var rowTotalProfit = profitRes.operatingProfit * qty;
      var rowTotalRecognizedRev = profitRes.recognizedRevenue * qty;

      totalUnits += qty;
      totalCustomerPayment += rowTotalPayment;
      totalRecognizedRevenue += rowTotalRecognizedRev;
      totalSettlement += rowTotalSettlement;
      totalOperatingProfit += rowTotalProfit;
      totalAdSpend += profitRes.inputs.adSpend * qty;

      results.push({
        rowNumber: r + 1,
        quantity: qty,
        inputs: profitRes.inputs,
        profit: profitRes,
        roas: roasRes,
        totalCustomerPayment: rowTotalPayment,
        totalSettlement: rowTotalSettlement,
        totalProfit: rowTotalProfit,
        isLoss: isLoss
      });
    }

    var avgMarginRate = totalRecognizedRevenue > EPSILON ? (totalOperatingProfit / totalRecognizedRevenue) * 100 : null;

    return {
      rows: results,
      skippedCount: skippedCount,
      summary: {
        skuCount: results.length,
        totalUnits: totalUnits,
        totalCustomerPayment: totalCustomerPayment,
        totalSettlement: totalSettlement,
        totalOperatingProfit: totalOperatingProfit,
        totalAdSpend: totalAdSpend,
        avgMarginRate: avgMarginRate,
        lossCount: lossCount
      }
    };
  }

  function decodeZipEntryText(bytes, entry) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var lh = entry.localHeaderOffset;
    if (lh + 30 > bytes.length || dv.getUint32(lh, true) !== 0x04034b50) {
      return Promise.reject(new Error(t('손상된 .xlsx 압축 헤더입니다.', 'Corrupted .xlsx ZIP local header.')));
    }
    var nameLen = dv.getUint16(lh + 26, true);
    var extraLen = dv.getUint16(lh + 28, true);
    var dataStart = lh + 30 + nameLen + extraLen;
    var slice = bytes.subarray(dataStart, dataStart + entry.compSize);

    if (entry.method === 0) {
      return Promise.resolve(new TextDecoder('utf-8').decode(slice));
    }
    if (entry.method === 8) {
      if (typeof DecompressionStream === 'undefined' || typeof Response === 'undefined') {
        return Promise.reject(
          new Error(
            t(
              '현재 브라우저는 내장 압축 해제(DecompressionStream)를 지원하지 않습니다. CSV 저장 또는 표 붙여넣기를 이용해 주세요.',
              'Your browser does not support native DecompressionStream. Please save as CSV or paste table rows directly.'
            )
          )
        );
      }
      var stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).text();
    }
    return Promise.reject(new Error(t('지원되지 않는 .xlsx 압축 방식입니다: ' + entry.method, 'Unsupported .xlsx compression method: ' + entry.method)));
  }

  function parseZipEntries(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
      throw new Error(
        t(
          '구형 .xls(97-2003) 파일은 지원되지 않습니다. 엑셀에서 .xlsx 또는 CSV로 저장하거나 표를 복사해 붙여넣어 주세요.',
          'Legacy binary .xls (97-2003) files are not supported. Save as .xlsx/.csv or paste table cells.'
        )
      );
    }

    var eocdOffset = -1;
    var minOffset = Math.max(0, bytes.length - 65557);
    for (var pos = bytes.length - 22; pos >= minOffset; pos--) {
      if (dv.getUint32(pos, true) === 0x06054b50) {
        var cdSizeCheck = dv.getUint32(pos + 12, true);
        var cdOffCheck = dv.getUint32(pos + 16, true);
        if (cdOffCheck + cdSizeCheck <= pos) {
          eocdOffset = pos;
          break;
        }
      }
    }

    if (eocdOffset === -1) {
      throw new Error(t('유효한 .xlsx(ZIP) 파일 형식이 아닙니다.', 'Not a valid .xlsx (ZIP) archive.'));
    }

    var totalEntries = dv.getUint16(eocdOffset + 10, true);
    var cdOffset = dv.getUint32(eocdOffset + 16, true);
    var entries = {};
    var cursor = cdOffset;
    var nameDecoder = new TextDecoder('utf-8');

    for (var i = 0; i < totalEntries && cursor + 46 <= eocdOffset; i++) {
      if (dv.getUint32(cursor, true) !== 0x02014b50) break;
      var method = dv.getUint16(cursor + 10, true);
      var compSize = dv.getUint32(cursor + 20, true);
      var nameLen = dv.getUint16(cursor + 28, true);
      var extraLen = dv.getUint16(cursor + 30, true);
      var commentLen = dv.getUint16(cursor + 32, true);
      var localHeaderOffset = dv.getUint32(cursor + 42, true);
      var rawName = nameDecoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen));
      var normName = rawName.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();

      entries[normName] = {
        name: normName,
        method: method,
        compSize: compSize,
        localHeaderOffset: localHeaderOffset
      };
      cursor += 46 + nameLen + extraLen + commentLen;
    }

    return { bytes: bytes, entries: entries };
  }

  function getXmlLocalName(node) {
    return (node.localName || node.nodeName || '').replace(/^.*:/, '');
  }

  function extractSiText(siEl) {
    var parts = [];
    var children = siEl.childNodes;
    for (var i = 0; i < children.length; i++) {
      var node = children[i];
      if (node.nodeType !== 1) continue;
      var name = getXmlLocalName(node);
      if (name === 't') {
        parts.push(node.textContent || '');
      } else if (name === 'r') {
        var rChildren = node.childNodes;
        for (var j = 0; j < rChildren.length; j++) {
          var rc = rChildren[j];
          if (rc.nodeType === 1 && getXmlLocalName(rc) === 't') {
            parts.push(rc.textContent || '');
          }
        }
      }
    }
    return parts.join('');
  }

  function colRefToIndex(refStr) {
    if (!refStr) return -1;
    var match = /^([A-Za-z]+)/.exec(String(refStr).trim());
    if (!match) return -1;
    var letters = match[1].toUpperCase();
    var col = 0;
    for (var i = 0; i < letters.length; i++) {
      col = col * 26 + (letters.charCodeAt(i) - 64);
    }
    return col - 1;
  }

  function resolveFirstSheetPath(entries, workbookXml, relsXml) {
    if (workbookXml && relsXml) {
      try {
        var parser = new DOMParser();
        var wbDoc = parser.parseFromString(workbookXml, 'application/xml');
        var relDoc = parser.parseFromString(relsXml, 'application/xml');

        var relMap = {};
        var relEls = relDoc.getElementsByTagName('*');
        for (var r = 0; r < relEls.length; r++) {
          if (getXmlLocalName(relEls[r]) === 'Relationship') {
            var rId = relEls[r].getAttribute('Id');
            var target = relEls[r].getAttribute('Target');
            if (rId && target) relMap[rId] = target;
          }
        }

        var wbEls = wbDoc.getElementsByTagName('*');
        for (var s = 0; s < wbEls.length; s++) {
          if (getXmlLocalName(wbEls[s]) === 'sheet') {
            var rid = wbEls[s].getAttribute('r:id') || wbEls[s].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
            if (rid && relMap[rid]) {
              var cleanTarget = relMap[rid].replace(/\\/g, '/').replace(/^\/+/, '');
              if (cleanTarget.indexOf('xl/') !== 0) {
                cleanTarget = 'xl/' + cleanTarget.replace(/^\.\.\//, '');
              }
              cleanTarget = cleanTarget.toLowerCase();
              if (entries[cleanTarget]) return cleanTarget;
            }
          }
        }
      } catch (e) {
        // Fallback below
      }
    }

    if (entries['xl/worksheets/sheet1.xml']) return 'xl/worksheets/sheet1.xml';
    var sheetKeys = Object.keys(entries).filter(function (k) {
      return /^xl\/worksheets\/[^/]+\.xml$/i.test(k);
    });
    sheetKeys.sort();
    return sheetKeys[0] || '';
  }

  function parseXlsxXmlSheet(sheetXml, sharedStringsXml) {
    var parser = new DOMParser();
    var sharedStrings = [];

    if (sharedStringsXml) {
      var ssDoc = parser.parseFromString(sharedStringsXml, 'application/xml');
      var ssNodes = ssDoc.getElementsByTagName('*');
      for (var i = 0; i < ssNodes.length; i++) {
        if (getXmlLocalName(ssNodes[i]) === 'si') {
          sharedStrings.push(extractSiText(ssNodes[i]));
        }
      }
    }

    var doc = parser.parseFromString(sheetXml, 'application/xml');
    var allNodes = doc.getElementsByTagName('*');
    var rows = [];

    for (var n = 0; n < allNodes.length; n++) {
      var node = allNodes[n];
      if (getXmlLocalName(node) !== 'row') continue;

      var rowVals = [];
      var prevCol = -1;
      var cNodes = node.childNodes;
      for (var c = 0; c < cNodes.length; c++) {
        var cellEl = cNodes[c];
        if (cellEl.nodeType !== 1 || getXmlLocalName(cellEl) !== 'c') continue;

        var colIdx = colRefToIndex(cellEl.getAttribute('r'));
        if (colIdx < 0) colIdx = prevCol + 1;
        prevCol = colIdx;
        while (rowVals.length <= colIdx) rowVals.push('');

        var cellType = cellEl.getAttribute('t') || 'n';
        var valText = '';
        var vEl = null;
        var isEl = null;
        var cellChildren = cellEl.childNodes;
        for (var k = 0; k < cellChildren.length; k++) {
          var ch = cellChildren[k];
          if (ch.nodeType !== 1) continue;
          var ln = getXmlLocalName(ch);
          if (ln === 'v') vEl = ch;
          else if (ln === 'is') isEl = ch;
        }

        if (cellType === 's' && vEl) {
          var ssIdx = parseInt(vEl.textContent || '0', 10);
          valText = Number.isFinite(ssIdx) && ssIdx >= 0 && ssIdx < sharedStrings.length ? sharedStrings[ssIdx] : '';
        } else if (cellType === 'inlineStr' && isEl) {
          valText = extractSiText(isEl);
        } else if (vEl) {
          valText = vEl.textContent || '';
        }

        rowVals[colIdx] = String(valText || '').trim();
      }

      if (!isRowEmpty(rowVals)) {
        rows.push(rowVals);
      }
    }

    return rows;
  }

  function decodeCsvBytes(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
      return new TextDecoder('euc-kr').decode(bytes);
    }
  }

  function parseSpreadsheetFile(file) {
    if (!file || typeof file.arrayBuffer !== 'function') {
      return Promise.reject(new Error(t('읽을 수 없는 파일입니다.', 'Invalid file object.')));
    }

    var fileName = String(file.name || '');
    var extMatch = /\.([^.]+)$/.exec(fileName.toLowerCase());
    var ext = extMatch ? extMatch[1] : '';

    return file.arrayBuffer().then(function (buf) {
      if (ext === 'xls') {
        throw new Error(
          t(
            '구형 .xls(97-2003) 파일은 지원되지 않습니다. 엑셀에서 .xlsx 또는 CSV로 저장하거나 표를 복사해 붙여넣어 주세요.',
            'Legacy binary .xls (97-2003) files are not supported. Save as .xlsx/.csv or paste table cells.'
          )
        );
      }

      var bytes = new Uint8Array(buf);
      var looksLikeZip = ext === 'xlsx' || (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b);

      if (looksLikeZip) {
        if (typeof DOMParser === 'undefined') {
          throw new Error(t('브라우저 XML 파서를 사용할 수 없습니다.', 'DOMParser is unavailable.'));
        }
        var archive = parseZipEntries(buf);
        var entries = archive.entries;
        var wbPromise = entries['xl/workbook.xml'] ? decodeZipEntryText(archive.bytes, entries['xl/workbook.xml']) : Promise.resolve('');
        var relsPromise = entries['xl/_rels/workbook.xml.rels'] ? decodeZipEntryText(archive.bytes, entries['xl/_rels/workbook.xml.rels']) : Promise.resolve('');
        var ssPromise = entries['xl/sharedstrings.xml'] ? decodeZipEntryText(archive.bytes, entries['xl/sharedstrings.xml']) : Promise.resolve('');

        return Promise.all([wbPromise, relsPromise, ssPromise]).then(function (parts) {
          var sheetPath = resolveFirstSheetPath(entries, parts[0], parts[1]);
          if (!sheetPath || !entries[sheetPath]) {
            throw new Error(t('.xlsx 파일 안에 읽을 수 있는 워크시트(Sheet)가 없습니다.', 'No readable worksheet found inside the .xlsx file.'));
          }
          return decodeZipEntryText(archive.bytes, entries[sheetPath]).then(function (sheetXml) {
            return parseXlsxXmlSheet(sheetXml, parts[2]);
          });
        });
      }

      var decoded = decodeCsvBytes(buf);
      return parseDelimitedText(decoded);
    });
  }

  function getSampleTemplateRows() {
    if (currentLang === 'en') {
      return [
        ['Product Name', 'Selling Price', 'Seller Discount', 'COGS', 'Fee (%)', 'Seller Shipping', 'Customer Shipping', 'Ad Spend (Per Unit)', 'Qty'],
        ['Cordless Mini Humidifier', 29900, 2000, 11000, 5.5, 3000, 0, 5000, 18],
        ['Silicone Dish Mat 2P', 15900, 1000, 4800, 10.8, 2800, 3000, 2500, 32],
        ['Insulated Tumbler 600ml (Loss Risk)', 18900, 3000, 8200, 10.8, 3000, 0, 6200, 12],
        ['Eco Tote Bag Pack', 24500, 0, 7900, 3500, 2700, 0, 3000, 25]
      ];
    }
    return [
      ['상품명', '판매가', '판매자할인', '매입원가', '수수료(%)', '실택배비', '고객배송비', '광고비(건당)', '수량'],
      ['무선 미니 가습기', 29900, 2000, 11000, 5.5, 3000, 0, 5000, 18],
      ['실리콘 주방 매트 2P', 15900, 1000, 4800, 10.8, 2800, 3000, 2500, 32],
      ['보온 텀블러 600ml (적자주의)', 18900, 3000, 8200, 10.8, 3000, 0, 6200, 12],
      ['친환경 캔버스 에코백', 24500, 0, 7900, 3500, 2700, 0, 3000, 25]
    ];
  }

  function downloadSampleExcelTemplate() {
    var rows = getSampleTemplateRows();
    return downloadCsv('seller-math-excel-template.csv', rows);
  }

  function getSamplePasteString() {
    return getSampleTemplateRows()
      .map(function (r) {
        return r.join('\t');
      })
      .join('\n');
  }

  function mountBulkExcelWidget(container, options) {
    if (!container || typeof document === 'undefined') return null;

    var opts = options || {};
    var getBase = typeof opts.getBaseInputs === 'function' ? opts.getBaseInputs : loadSharedInputs;

    var state = {
      sourceName: '',
      rawRows: null,
      headers: [],
      dataRows: [],
      mapping: null,
      batchResult: null,
      pasteText: '',
      errorMsg: '',
      noticeMsg: ''
    };

    function recompute() {
      if (!state.dataRows || state.dataRows.length === 0) {
        state.batchResult = null;
        return;
      }
      state.batchResult = computeBatchRows(state.dataRows, state.mapping, getBase());
    }

    function applyParsedRows(rows, sourceLabel) {
      state.errorMsg = '';
      state.noticeMsg = '';
      if (!Array.isArray(rows) || rows.length < 2) {
        state.rawRows = null;
        state.headers = [];
        state.dataRows = [];
        state.mapping = null;
        state.batchResult = null;
        state.errorMsg = t(
          '머리글(1행)과 데이터(2행 이상)가 포함된 파일이나 표를 넣어주세요.',
          'Please provide at least a header row and 1 data row.'
        );
        render();
        return;
      }

      var detected = findBestHeaderRow(rows);
      state.sourceName = sourceLabel || '';
      state.rawRows = rows;
      state.headers = detected.headers;
      state.dataRows = detected.dataRows;
      state.mapping = detected.mapping;
      recompute();
      render();
    }

    function handleFileSelection(file) {
      if (!file) return;
      state.errorMsg = '';
      state.noticeMsg = '';
      parseSpreadsheetFile(file).then(
        function (rows) {
          applyParsedRows(rows, file.name);
        },
        function (err) {
          state.rawRows = null;
          state.batchResult = null;
          state.errorMsg = (err && err.message) || t('파일을 해석하지 못했습니다.', 'Failed to parse spreadsheet file.');
          render();
        }
      );
    }

    function handleBatchCsvDownload() {
      if (!state.batchResult || !state.batchResult.rows.length) return;
      var header = [
        t('상품명', 'Product'),
        t('수량', 'Qty'),
        t('정상가(원)', 'List Price'),
        t('고객 실결제가(원)', 'Customer Payment'),
        t('마켓 수수료(원)', 'Platform Fee'),
        t('예상 정산입금액(원)', 'Est. Payout'),
        t('건당 순이익(원)', 'Unit Net Profit'),
        t('합계 순이익(원)', 'Total Net Profit'),
        t('순마진율(%)', 'Net Margin (%)'),
        t('손익분기 ROAS(%)', 'Break-even ROAS (%)'),
        t('수익 상태', 'Status')
      ];
      var csvRows = [header];
      state.batchResult.rows.forEach(function (item) {
        var marginVal = item.profit.netMarginRate !== null ? Number(item.profit.netMarginRate.toFixed(2)) : '-';
        var roasVal = item.roas.isAchievable ? Number(item.roas.breakEvenRoas.toFixed(1)) : '-';
        csvRows.push([
          item.inputs.itemName,
          { value: item.quantity, numeric: true },
          { value: Math.round(item.inputs.listPrice), numeric: true },
          { value: Math.round(item.profit.customerPayment), numeric: true },
          { value: Math.round(item.profit.feeTotalInput), numeric: true },
          { value: Math.round(item.profit.platformSettlement), numeric: true },
          { value: Math.round(item.profit.operatingProfit), numeric: true },
          { value: Math.round(item.totalProfit), numeric: true },
          typeof marginVal === 'number' ? { value: marginVal, numeric: true } : marginVal,
          typeof roasVal === 'number' ? { value: roasVal, numeric: true } : roasVal,
          item.isLoss ? t('적자 주의', 'Loss Risk') : t('흑자', 'Profitable')
        ]);
      });
      var filename = 'seller-math-batch-' + new Date().toISOString().slice(0, 10) + '.csv';
      downloadCsv(filename, csvRows);
    }

    function handleSaveAllScenarios() {
      if (!state.batchResult || !state.batchResult.rows.length) return;
      var items = state.batchResult.rows;
      var limit = Math.min(items.length, MAX_SCENARIOS);
      var beforeCount = loadScenarios().length;
      for (var i = limit - 1; i >= 0; i--) {
        saveScenario(items[i].inputs.itemName, items[i].profit);
      }
      var afterCount = loadScenarios().length;
      state.noticeMsg = t(
        '상위 ' + limit + '개 품목을 시나리오 비교함에 추가했습니다. (현재 저장: ' + afterCount + '개 / 최대 ' + MAX_SCENARIOS + '개)',
        'Added top ' + limit + ' items to Scenario Comparison (Saved: ' + afterCount + ' / max ' + MAX_SCENARIOS + ').'
      );
      if (typeof opts.onScenariosSaved === 'function') {
        opts.onScenariosSaved(beforeCount, afterCount);
      }
      render();
    }

    function renderSummaryCard(label, valueText, subText, toneClass) {
      var card = createEl('div', 'bulk-summary-card' + (toneClass ? ' ' + toneClass : ''));
      card.appendChild(createEl('div', 'bulk-summary-label', label));
      card.appendChild(createEl('div', 'bulk-summary-val', valueText));
      if (subText) {
        card.appendChild(createEl('div', 'bulk-summary-sub', subText));
      }
      return card;
    }

    function render() {
      clearEl(container);

      var header = createEl('div', 'bulk-excel-header');
      var titleBox = createEl('div');
      titleBox.appendChild(
        createEl(
          'h2',
          'card-title',
          t('엑셀(.xlsx · .csv) & 표 붙여넣기 일괄 수익 계산기', 'Excel (.xlsx / .csv) & Table Paste Batch Calculator')
        )
      );
      titleBox.appendChild(
        createEl(
          'p',
          'card-subtitle',
          t(
            '매출·원가 엑셀 파일을 끌어다 놓거나 표를 Ctrl+V로 붙여넣으면 여러 상품의 정산액·순이익·적자 여부를 1초 만에 일괄 계산합니다.',
            'Drop your Excel/CSV sheet or paste cells (Ctrl+V) to compute settlement, net profit, and loss alerts across all SKUs at once.'
          )
        )
      );
      header.appendChild(titleBox);
      header.appendChild(
        createEl(
          'span',
          'bulk-privacy-badge',
          t('🔒 서버 전송 0% · 내 브라우저에서만 계산', '🔒 100% Local · Never leaves your browser')
        )
      );
      container.appendChild(header);

      // Drag & Drop + File Input
      var dropLabel = createEl('label', 'excel-dropzone');
      var fileInput = createEl('input', 'excel-file-input');
      fileInput.type = 'file';
      fileInput.accept = '.xlsx,.csv,.tsv,.txt';
      fileInput.addEventListener('change', function (e) {
        var f = e.target && e.target.files && e.target.files[0];
        if (f) handleFileSelection(f);
      });

      dropLabel.appendChild(fileInput);
      dropLabel.appendChild(createEl('div', 'excel-dropzone-icon', '📊'));
      dropLabel.appendChild(
        createEl(
          'div',
          'excel-dropzone-title',
          t('여기를 클릭하거나 엑셀(.xlsx, .csv, .tsv) 파일을 끌어다 놓으세요', 'Click to choose or drag & drop .xlsx / .csv / .tsv here')
        )
      );
      dropLabel.appendChild(
        createEl(
          'div',
          'excel-dropzone-sub',
          t(
            '스마트스토어·쿠팡 정산 시트, 개인 매출장부 모두 지원 · 현재 화면의 과세자/VAT 기준이 그대로 적용됩니다.',
            'Works with marketplace exports or custom sheets · Automatically applies your active VAT/taxpayer settings.'
          )
        )
      );

      dropLabel.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropLabel.classList.add('is-dragover');
      });
      dropLabel.addEventListener('dragleave', function () {
        dropLabel.classList.remove('is-dragover');
      });
      dropLabel.addEventListener('drop', function (e) {
        e.preventDefault();
        dropLabel.classList.remove('is-dragover');
        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files[0]) handleFileSelection(files[0]);
      });
      container.appendChild(dropLabel);

      // Paste Area + Action Row
      var pasteWrap = createEl('div', 'excel-paste-wrap');
      var labelRow = createEl('div', 'excel-paste-label-row');
      var pasteLbl = createEl(
        'label',
        'form-label',
        t('또는 엑셀/구글시트 표를 복사(Ctrl+C)해 바로 붙여넣기(Ctrl+V)', 'Or copy table rows from Excel/Sheets and paste here (Ctrl+V)')
      );
      var pasteId = 'bulk-paste-' + (container.id || 'widget');
      pasteLbl.setAttribute('for', pasteId);
      labelRow.appendChild(pasteLbl);
      pasteWrap.appendChild(labelRow);

      var textarea = createEl('textarea', 'excel-paste-area');
      textarea.id = pasteId;
      textarea.value = state.pasteText;
      textarea.placeholder = t(
        '예시) 첫 줄은 제목행(상품명, 판매가, 원가, 수수료, 택배비, 수량)\n무선 미니 가습기\t29900\t11000\t5.5\t3000\t10',
        'Example) Header row first (Product, Price, COGS, Fee, Shipping, Qty)\nMini Humidifier\t29900\t11000\t5.5\t3000\t10'
      );
      textarea.addEventListener('input', function () {
        state.pasteText = textarea.value;
      });
      textarea.addEventListener('paste', function () {
        setTimeout(function () {
          state.pasteText = textarea.value;
          if (state.pasteText.trim()) {
            applyParsedRows(parseDelimitedText(state.pasteText), t('붙여넣은 표 데이터', 'Pasted Table Data'));
          }
        }, 0);
      });
      pasteWrap.appendChild(textarea);

      var actionsRow = createEl('div', 'bulk-actions-row');
      var calcPasteBtn = createEl('button', 'btn btn-primary', t('붙여넣은 표 일괄 계산하기', 'Calculate Pasted Rows'));
      calcPasteBtn.type = 'button';
      calcPasteBtn.addEventListener('click', function () {
        state.pasteText = textarea.value;
        applyParsedRows(parseDelimitedText(state.pasteText), t('붙여넣은 표 데이터', 'Pasted Table Data'));
      });

      var sampleFillBtn = createEl('button', 'btn btn-secondary', t('샘플 데이터로 체험하기', 'Try Sample Data'));
      sampleFillBtn.type = 'button';
      sampleFillBtn.addEventListener('click', function () {
        state.pasteText = getSamplePasteString();
        applyParsedRows(parseDelimitedText(state.pasteText), t('샘플 셀러 매출장부 (4종)', 'Sample Seller Sheet (4 SKUs)'));
      });

      var downloadTplBtn = createEl('button', 'btn btn-outline', t('샘플 엑셀(CSV) 양식 받기', 'Download Sample CSV'));
      downloadTplBtn.type = 'button';
      downloadTplBtn.addEventListener('click', function () {
        downloadSampleExcelTemplate();
      });

      actionsRow.appendChild(calcPasteBtn);
      actionsRow.appendChild(sampleFillBtn);
      actionsRow.appendChild(downloadTplBtn);

      if (state.rawRows || state.pasteText) {
        var clearBtn = createEl('button', 'btn btn-ghost', t('초기화', 'Clear'));
        clearBtn.type = 'button';
        clearBtn.addEventListener('click', function () {
          state.sourceName = '';
          state.rawRows = null;
          state.headers = [];
          state.dataRows = [];
          state.mapping = null;
          state.batchResult = null;
          state.pasteText = '';
          state.errorMsg = '';
          state.noticeMsg = '';
          render();
        });
        actionsRow.appendChild(clearBtn);
      }

      pasteWrap.appendChild(actionsRow);
      container.appendChild(pasteWrap);

      if (state.errorMsg) {
        container.appendChild(createEl('div', 'bulk-error-banner', state.errorMsg));
      }
      if (state.noticeMsg) {
        container.appendChild(createEl('div', 'status-pill status-positive', state.noticeMsg));
      }

      // Column Mapping Override Panel
      if (state.headers.length > 0 && state.mapping) {
        var details = createEl('details', 'column-map-panel');
        var mappedCount = countMappedFields(state.mapping);
        if (mappedCount < 2) details.open = true;

        var summaryEl = createEl('summary', 'column-map-summary');
        summaryEl.appendChild(
          createEl(
            'span',
            '',
            t(
              '⚙️ 열 자동 매칭 설정 (' + mappedCount + '개 열 인식됨 · 필요시 직접 변경)',
              '⚙️ Column Auto-Mapping (' + mappedCount + ' matched · click to adjust)'
            )
          )
        );
        summaryEl.appendChild(
          createEl(
            'span',
            'bulk-summary-sub',
            t('미매칭 열은 현재 계산기 설정값 적용', 'Unmapped fields use active settings')
          )
        );
        details.appendChild(summaryEl);

        var grid = createEl('div', 'column-map-grid');
        BULK_FIELD_SPECS.forEach(function (spec) {
          var item = createEl('div', 'column-map-item');
          var lbl = createEl('label', '', currentLang === 'en' ? spec.en : spec.ko);
          var sel = createEl('select', 'select-control');
          var selId = 'bulk-map-' + spec.key + '-' + (container.id || 'w');
          sel.id = selId;
          lbl.setAttribute('for', selId);

          var noneOpt = createEl('option', '', t('-- 미지정 (현재 설정값 사용) --', '-- Unmapped (Use active setting) --'));
          noneOpt.value = '-1';
          sel.appendChild(noneOpt);

          state.headers.forEach(function (h, idx) {
            var opt = createEl('option', '', '[' + (idx + 1) + '열] ' + (h || t('(제목 없음)', '(Empty)')));
            opt.value = String(idx);
            sel.appendChild(opt);
          });

          sel.value = String(state.mapping[spec.key]);
          sel.addEventListener('change', function () {
            state.mapping[spec.key] = parseInt(sel.value, 10);
            recompute();
            render();
          });

          item.appendChild(lbl);
          item.appendChild(sel);
          grid.appendChild(item);
        });

        details.appendChild(grid);
        container.appendChild(details);
      }

      // Results Section
      if (state.batchResult) {
        var res = state.batchResult;
        var sum = res.summary;
        var resSection = createEl('div', 'bulk-results-section');

        var toolbar = createEl('div', 'bulk-toolbar-row');
        var statusLabel = t(
          '📄 ' + (state.sourceName || '입력 데이터') + ' · 총 ' + sum.skuCount + '개 품목 (' + formatNumber(sum.totalUnits) + '건)',
          '📄 ' + (state.sourceName || 'Input') + ' · ' + sum.skuCount + ' SKUs (' + formatNumber(sum.totalUnits) + ' units)'
        );
        if (res.skippedCount > 0) {
          statusLabel += t(' · 공백/요약행 ' + res.skippedCount + '건 제외', ' · ' + res.skippedCount + ' blank/summary rows skipped');
        }
        toolbar.appendChild(createEl('div', 'bulk-file-status', statusLabel));

        var exportRow = createEl('div', 'btn-row');
        exportRow.style.marginTop = '0';
        var dlResultBtn = createEl('button', 'btn btn-secondary btn-table-sm', t('전체 결과 엑셀(CSV) 다운로드', 'Export Results CSV'));
        dlResultBtn.type = 'button';
        dlResultBtn.addEventListener('click', handleBatchCsvDownload);

        var addScenBtn = createEl('button', 'btn btn-outline btn-table-sm', t('시나리오 비교함에 일괄 추가', 'Add to Comparison'));
        addScenBtn.type = 'button';
        addScenBtn.addEventListener('click', handleSaveAllScenarios);

        exportRow.appendChild(dlResultBtn);
        exportRow.appendChild(addScenBtn);
        toolbar.appendChild(exportRow);
        resSection.appendChild(toolbar);

        // Summary KPI Cards
        var kpiGrid = createEl('div', 'bulk-summary-grid');
        kpiGrid.appendChild(
          renderSummaryCard(
            t('총 실결제 매출', 'Total Customer Sales'),
            formatCurrency(sum.totalCustomerPayment),
            t(sum.skuCount + '개 품목 · 총 ' + formatNumber(sum.totalUnits) + '개', sum.skuCount + ' SKUs · ' + formatNumber(sum.totalUnits) + ' units'),
            ''
          )
        );
        kpiGrid.appendChild(
          renderSummaryCard(
            t('총 예상 정산액', 'Total Est. Payout'),
            formatCurrency(sum.totalSettlement),
            t('수수료·배송정산 반영', 'After platform fees & shipping'),
            ''
          )
        );
        kpiGrid.appendChild(
          renderSummaryCard(
            t('총 예상 순이익 (평균 마진율)', 'Total Net Profit (Avg Margin)'),
            formatCurrency(sum.totalOperatingProfit),
            t(
              '평균 순마진율 ' + (sum.avgMarginRate !== null ? formatPercent(sum.avgMarginRate) : '-'),
              'Avg margin ' + (sum.avgMarginRate !== null ? formatPercent(sum.avgMarginRate) : '-')
            ),
            sum.totalOperatingProfit >= 0 ? 'is-positive' : 'is-negative'
          )
        );
        kpiGrid.appendChild(
          renderSummaryCard(
            t('적자 주의 상품', 'Loss-Making SKUs'),
            sum.lossCount + t('개 품목', ' SKUs'),
            sum.lossCount > 0 ? t('붉은 행의 원가·광고비를 점검하세요', 'Review highlighted red rows') : t('전 품목 흑자 상태', 'All items profitable'),
            sum.lossCount > 0 ? 'is-negative' : 'is-positive'
          )
        );
        resSection.appendChild(kpiGrid);

        // Result Table
        var wrap = createEl('div', 'table-responsive');
        var table = createEl('table', 'data-table');
        var thead = createEl('thead');
        var hTr = createEl('tr');
        [
          t('상품명', 'Product'),
          t('수량', 'Qty'),
          t('판매가', 'List Price'),
          t('예상 정산액(건당)', 'Payout/Unit'),
          t('순이익(건당)', 'Profit/Unit'),
          t('순이익(합계)', 'Total Profit'),
          t('순마진율', 'Margin'),
          t('손익분기 ROAS', 'BE ROAS'),
          t('상세', 'Detail')
        ].forEach(function (label) {
          hTr.appendChild(createEl('th', '', label));
        });
        thead.appendChild(hTr);
        table.appendChild(thead);

        var tbody = createEl('tbody');
        res.rows.forEach(function (item) {
          var tr = createEl('tr', item.isLoss ? 'bulk-row-loss' : '');

          var nameTd = createEl('td', 'bulk-item-name', item.inputs.itemName);
          tr.appendChild(nameTd);
          tr.appendChild(createEl('td', '', formatNumber(item.quantity)));
          tr.appendChild(createEl('td', '', formatCurrency(item.inputs.listPrice)));
          tr.appendChild(createEl('td', '', formatCurrency(item.profit.platformSettlement)));

          var unitProfitClass = item.profit.operatingProfit >= 0 ? 'bulk-profit-pos' : 'bulk-profit-neg';
          tr.appendChild(createEl('td', unitProfitClass, formatCurrency(item.profit.operatingProfit)));
          tr.appendChild(createEl('td', unitProfitClass, formatCurrency(item.totalProfit)));
          tr.appendChild(createEl('td', unitProfitClass, item.profit.netMarginLabel));
          tr.appendChild(createEl('td', '', item.roas.breakEvenRoasLabel));

          var actionTd = createEl('td');
          var detailBtn = createEl('button', 'btn btn-outline btn-table-sm', t('상세 보기', 'Inspect'));
          detailBtn.type = 'button';
          detailBtn.addEventListener('click', function () {
            saveSharedInputs(item.inputs);
            if (typeof opts.onSelectRow === 'function') {
              opts.onSelectRow(item.inputs, item);
            } else {
              window.location.href = 'profit-calculator.html';
            }
          });
          actionTd.appendChild(detailBtn);
          tr.appendChild(actionTd);

          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        resSection.appendChild(wrap);

        container.appendChild(resSection);
      }
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('sellermath:langchange', function () {
        recompute();
        render();
      });
    }

    render();
    return {
      recalculate: function () {
        recompute();
        render();
      },
      getState: function () {
        return state;
      }
    };
  }

  /* ==========================================================================
     대한민국 현행 세법(부가가치세법·소득세법) 통합 과세유형·세액·신고 진단 엔진
     ========================================================================== */

  var VAT_SIMPLIFIED_THRESHOLD = 104000000; // 1억 400만 원 미만 (2024.7.1. 시행 부가가치세법 제61조·시행령 제109조)
  var VAT_EXEMPT_PAYMENT_THRESHOLD = 48000000; // 4,800만 원 미만 (부가가치세법 제69조 간이과세자 납부의무 면제 기준)
  var CARD_ISSUANCE_CREDIT_RATE = 0.013; // 신용카드매출전표 등 발행세액공제 1.3% (부가가치세법 제46조)
  var CARD_ISSUANCE_CREDIT_CAP = 10000000; // 연 1,000만 원 한도
  var CARD_CREDIT_PRIOR_SUPPLY_LIMIT = 1000000000; // 직전 연도 과세공급가액 10억 원 이하 개인사업자 적용

  var KOREAN_INCOME_TAX_BRACKETS = [
    { min: 0, max: 14000000, rate: 0.06, deduction: 0, labelKo: '1,400만 원 이하', labelEn: 'Up to 14M KRW' },
    { min: 14000000, max: 50000000, rate: 0.15, deduction: 1260000, labelKo: '1,400만 원 초과 ~ 5,000만 원 이하', labelEn: '14M ~ 50M KRW' },
    { min: 50000000, max: 88000000, rate: 0.24, deduction: 5760000, labelKo: '5,000만 원 초과 ~ 8,800만 원 이하', labelEn: '50M ~ 88M KRW' },
    { min: 88000000, max: 150000000, rate: 0.35, deduction: 15440000, labelKo: '8,800만 원 초과 ~ 1억 5,000만 원 이하', labelEn: '88M ~ 150M KRW' },
    { min: 150000000, max: 300000000, rate: 0.38, deduction: 19940000, labelKo: '1억 5,000만 원 초과 ~ 3억 원 이하', labelEn: '150M ~ 300M KRW' },
    { min: 300000000, max: 500000000, rate: 0.40, deduction: 25940000, labelKo: '3억 원 초과 ~ 5억 원 이하', labelEn: '300M ~ 500M KRW' },
    { min: 500000000, max: 1000000000, rate: 0.42, deduction: 35940000, labelKo: '5억 원 초과 ~ 10억 원 이하', labelEn: '500M ~ 1B KRW' },
    { min: 1000000000, max: Infinity, rate: 0.45, deduction: 65940000, labelKo: '10억 원 초과', labelEn: 'Over 1B KRW' }
  ];

  var INDUSTRY_TAX_SPECS = {
    retail_ecommerce: {
      key: 'retail_ecommerce',
      nameKo: '전자상거래 · 소매업 (통신판매업)',
      nameEn: 'E-Commerce / Retail',
      forcedType: null,
      vatRatePct: 15,
      doubleEntryLimit: 300000000,
      simpleExpenseContLimit: 60000000,
      sincereFilingLimit: 1500000000,
      simpleRateBase: 0.86,
      simpleRateExcess: 0.80,
      standardRate: 0.111
    },
    food: {
      key: 'food',
      nameKo: '음식점업 · 카페',
      nameEn: 'Restaurants & Cafe',
      forcedType: null,
      vatRatePct: 15,
      doubleEntryLimit: 150000000,
      simpleExpenseContLimit: 36000000,
      sincereFilingLimit: 750000000,
      simpleRateBase: 0.897,
      simpleRateExcess: 0.867,
      standardRate: 0.114
    },
    manufacturing_b2c: {
      key: 'manufacturing_b2c',
      nameKo: '제조업 (최종소비자 직접 판매)',
      nameEn: 'B2C Manufacturing',
      forcedType: null,
      vatRatePct: 20,
      doubleEntryLimit: 150000000,
      simpleExpenseContLimit: 36000000,
      sincereFilingLimit: 750000000,
      simpleRateBase: 0.889,
      simpleRateExcess: 0.862,
      standardRate: 0.134
    },
    service_it: {
      key: 'service_it',
      nameKo: '정보통신 · 마케팅 · 일반 서비스업',
      nameEn: 'IT / Marketing / Services',
      forcedType: null,
      vatRatePct: 30,
      doubleEntryLimit: 75000000,
      simpleExpenseContLimit: 24000000,
      sincereFilingLimit: 500000000,
      simpleRateBase: 0.641,
      simpleRateExcess: 0.541,
      standardRate: 0.172
    },
    wholesale_excluded: {
      key: 'wholesale_excluded',
      nameKo: '도매업 · 상품중개업 (간이과세 배제)',
      nameEn: 'Wholesale / Brokerage (Simplified Excluded)',
      forcedType: 'general',
      vatRatePct: 15,
      doubleEntryLimit: 300000000,
      simpleExpenseContLimit: 60000000,
      sincereFilingLimit: 1500000000,
      simpleRateBase: 0.902,
      simpleRateExcess: 0.840,
      standardRate: 0.086
    },
    exempt_goods: {
      key: 'exempt_goods',
      nameKo: '면세재화 (미가공 농축수산물·도서·출판)',
      nameEn: 'VAT-Exempt Goods (Unprocessed Food / Books)',
      forcedType: 'exempt',
      vatRatePct: 0,
      doubleEntryLimit: 300000000,
      simpleExpenseContLimit: 60000000,
      sincereFilingLimit: 1500000000,
      simpleRateBase: 0.880,
      simpleRateExcess: 0.820,
      standardRate: 0.105
    }
  };

  function resolveIncomeTaxBracket(taxBase) {
    var cleanBase = Math.max(0, taxBase);
    for (var i = 0; i < KOREAN_INCOME_TAX_BRACKETS.length; i++) {
      var b = KOREAN_INCOME_TAX_BRACKETS[i];
      if (cleanBase <= b.max) {
        return { index: i, bracket: b };
      }
    }
    return {
      index: KOREAN_INCOME_TAX_BRACKETS.length - 1,
      bracket: KOREAN_INCOME_TAX_BRACKETS[KOREAN_INCOME_TAX_BRACKETS.length - 1]
    };
  }

  function computeProgressiveIncomeTax(businessIncome, opt) {
    var dependents = Math.max(1, Math.round(opt.dependentsCount || 1));
    var personalDeduction = dependents * 1500000;
    var extraDeduction = Math.max(0, opt.extraDeduction || 0);
    var taxBase = Math.max(0, businessIncome - personalDeduction - extraDeduction);

    var resolved = resolveIncomeTaxBracket(taxBase);
    var br = resolved.bracket;
    var calculatedTax = businessIncome > 0 && taxBase > 0 ? Math.max(0, taxBase * br.rate - br.deduction) : 0;

    var bookkeepingCredit = 0;
    if (opt.applyDoubleCredit && calculatedTax > 0) {
      bookkeepingCredit = Math.min(1000000, Math.round(calculatedTax * 0.2));
    }
    var remAfterBook = Math.max(0, calculatedTax - bookkeepingCredit);
    var standardCredit = businessIncome > 0 && calculatedTax > 0 ? Math.min(remAfterBook, 70000) : 0;
    var remAfterStd = Math.max(0, remAfterBook - standardCredit);
    var eFilingCredit = opt.includeEFilingCredit && remAfterStd > 0 ? Math.min(remAfterStd, 20000) : 0;

    var determinedIncomeTax = Math.max(0, Math.round(remAfterStd - eFilingCredit));
    var localIncomeTax = Math.floor((determinedIncomeTax * 0.1) / 10) * 10;

    return {
      businessIncome: businessIncome,
      personalDeduction: personalDeduction,
      extraDeduction: extraDeduction,
      taxBase: taxBase,
      bracketIndex: resolved.index,
      bracketRate: br.rate * 100,
      bracketLabel: currentLang === 'en' ? br.labelEn : br.labelKo,
      progressiveDeduction: br.deduction,
      calculatedTax: Math.round(calculatedTax),
      bookkeepingCredit: bookkeepingCredit,
      standardCredit: Math.round(standardCredit),
      eFilingCredit: Math.round(eFilingCredit),
      determinedIncomeTax: determinedIncomeTax,
      localIncomeTax: localIncomeTax,
      totalIncomeTax: determinedIncomeTax + localIncomeTax,
      hasLoss: businessIncome < 0,
      carryforwardLoss: businessIncome < 0 ? Math.abs(Math.round(businessIncome)) : 0
    };
  }

  function calculateKoreanTax(rawTaxInputs) {
    var src = rawTaxInputs && typeof rawTaxInputs === 'object' ? rawTaxInputs : {};
    var validPeriodModes = ['annual', 'monthly', 'half_year', 'quarterly'];
    var periodMode = validPeriodModes.indexOf(src.periodMode) !== -1 ? src.periodMode : 'annual';
    var multiplierMap = { annual: 1, monthly: 12, half_year: 2, quarterly: 4 };
    var periodMultiplier = multiplierMap[periodMode];

    var industryKey = Object.prototype.hasOwnProperty.call(INDUSTRY_TAX_SPECS, src.industryKey) ? src.industryKey : 'retail_ecommerce';
    var spec = INDUSTRY_TAX_SPECS[industryKey];

    var validOverrides = ['auto', 'general', 'simplified', 'exempt'];
    var taxpayerOverride = validOverrides.indexOf(src.taxpayerOverride) !== -1 ? src.taxpayerOverride : 'auto';
    var isNewBusiness = toBoolean(src.isNewBusiness, false);

    var priorYearGrossSales = null;
    if (src.priorYearGrossSales !== null && src.priorYearGrossSales !== '' && typeof src.priorYearGrossSales !== 'undefined') {
      var pVal = Number(src.priorYearGrossSales);
      if (Number.isFinite(pVal) && pVal >= 0) {
        priorYearGrossSales = pVal;
      }
    }

    var grossSalesInput = toNonNegativeNumber(src.grossSales, 0);
    var cogsInput = toNonNegativeNumber(src.cogsTotal, 0);
    var feeInput = toNonNegativeNumber(src.platformFeeTotal, 0);
    var shipInput = toNonNegativeNumber(src.shippingCostTotal, 0);
    var adInput = toNonNegativeNumber(src.adSpendTotal, 0);
    var otherInput = toNonNegativeNumber(src.otherExpenseTotal, 0);

    var cardSalesRatio = Math.min(100, toNonNegativeNumber(src.cardSalesRatio, 95));
    var nonQualifiedExpenseRatio = Math.min(100, toNonNegativeNumber(src.nonQualifiedExpenseRatio, 0));
    var dependentsCount = Math.max(1, Math.min(20, Math.round(toNonNegativeNumber(src.dependentsCount, 1))));
    var extraDeduction = toNonNegativeNumber(src.extraDeduction, 0);
    var useDoubleEntryCredit = toBoolean(src.useDoubleEntryCredit, false);
    var includeEFilingCredit = toBoolean(src.includeEFilingCredit, true);

    var normalizedInputs = {
      periodMode: periodMode,
      periodMultiplier: periodMultiplier,
      industryKey: industryKey,
      taxpayerOverride: taxpayerOverride,
      isNewBusiness: isNewBusiness,
      priorYearGrossSales: priorYearGrossSales,
      grossSales: grossSalesInput,
      cogsTotal: cogsInput,
      platformFeeTotal: feeInput,
      shippingCostTotal: shipInput,
      adSpendTotal: adInput,
      otherExpenseTotal: otherInput,
      cardSalesRatio: cardSalesRatio,
      nonQualifiedExpenseRatio: nonQualifiedExpenseRatio,
      dependentsCount: dependentsCount,
      extraDeduction: extraDeduction,
      useDoubleEntryCredit: useDoubleEntryCredit,
      includeEFilingCredit: includeEFilingCredit
    };

    var annualGrossSales = grossSalesInput * periodMultiplier;
    var annualCogs = cogsInput * periodMultiplier;
    var annualFee = feeInput * periodMultiplier;
    var annualShip = shipInput * periodMultiplier;
    var annualAd = adInput * periodMultiplier;
    var annualOther = otherInput * periodMultiplier;
    var totalCashCosts = annualCogs + annualFee + annualShip + annualAd + annualOther;
    var preTaxCashProfit = annualGrossSales - totalCashCosts;

    var annualized = {
      grossSales: annualGrossSales,
      cogsTotal: annualCogs,
      platformFeeTotal: annualFee,
      shippingCostTotal: annualShip,
      adSpendTotal: annualAd,
      otherExpenseTotal: annualOther,
      totalCashCosts: totalCashCosts,
      preTaxCashProfit: preTaxCashProfit
    };

    // 1. 과세유형 판정 (현행 부가가치세법 제26조, 제61조, 제69조, 시행령 제109조)
    var basisSalesForVat = isNewBusiness ? 0 : priorYearGrossSales !== null ? priorYearGrossSales : annualGrossSales;
    var determinedType = 'simplified_taxable';
    var taxpayerType = 'simplified';
    var legalBasis = '';
    var title = '';
    var subtitle = '';
    var invoiceDutyText = '';
    var conversionAlertText = '';

    if (spec.forcedType === 'exempt' || taxpayerOverride === 'exempt') {
      determinedType = 'exempt';
      taxpayerType = 'exempt';
      title = t('면세사업자 (부가가치세 면세 · 종합소득세 과세)', 'VAT-Exempt Business (Income Tax Subject)');
      subtitle = t(
        '부가가치세 신고·납부는 면제되지만, 매년 2월 면세사업자 사업장현황신고와 5월 종합소득세 신고는 반드시 해야 합니다.',
        'Exempt from VAT filing/payment, but annual Business Status Report (Feb) and Income Tax Return (May) are mandatory.'
      );
      legalBasis = t('부가가치세법 제26조(면세) · 소득세법 제78조(사업장현황신고)', 'VAT Act Art. 26 · Income Tax Act Art. 78');
      invoiceDutyText = t('부가가치세 세금계산서 대신 [계산서] 또는 신용카드·현금영수증 발급 (매입 부가세 공제 불가·전액 경비 인정)', 'Issues VAT-free Invoices; Input VAT is non-creditable and fully treated as deductible cost');
      conversionAlertText = t('과세 재화(가공식품·일반 공산품 등)를 함께 판매하면 과세·면세 겸영사업자로 전환되므로 구분 기장이 필요합니다.', 'Selling taxable goods alongside exempt goods triggers mixed-taxpayer status requiring separate books.');
    } else if (spec.forcedType === 'general' || taxpayerOverride === 'general' || (!isNewBusiness && taxpayerOverride === 'auto' && basisSalesForVat >= VAT_SIMPLIFIED_THRESHOLD)) {
      determinedType = 'general';
      taxpayerType = 'general';
      title = t('일반과세자 (부가세 10% 정식 과세 · 매입세액 전액 공제/환급)', 'General Taxpayer (10% VAT · Full Input Credit & Refund)');
      if (spec.forcedType === 'general') {
        subtitle = t('선택하신 업종(도매·중개 등)은 매출액과 무관하게 부가가치세법상 간이과세 배제 업종이므로 일반과세자가 적용됩니다.', 'Selected industry is statutorily excluded from simplified VAT regardless of turnover.');
      } else if (taxpayerOverride === 'general') {
        subtitle = t('일반과세자 기준이 선택되었습니다. 매출의 10% 부가세를 납부하되, 세금계산서·사업용카드 매입 부가세 10%를 전액 공제·환급받습니다.', 'General VAT selected: collect 10% output VAT and claim full 10% qualified input VAT credits/refunds.');
      } else {
        subtitle = t(
          '연환산 공급대가(' + formatCurrency(basisSalesForVat) + ')가 1억 400만 원 이상이므로 일반과세 과세대상입니다.',
          'Annual gross revenue (' + formatCurrency(basisSalesForVat) + ') meets or exceeds 104M KRW general VAT threshold.'
        );
      }
      legalBasis = t('부가가치세법 제30조(10% 세율) · 제61조(간이과세 기준 1억 400만 원) · 제46조(카드발행공제 1.3%)', 'VAT Act Art. 30 (10%) · Art. 61 (104M Threshold) · Art. 46 (1.3% Card Credit)');
      invoiceDutyText = t('세금계산서 발급 의무자 (일반 소비자 판매는 마켓 PG·카드·현금영수증 자동 발행)', 'Tax invoice issuance required for B2B; PG/card receipts cover B2C sales');
      conversionAlertText =
        annualGrossSales < VAT_SIMPLIFIED_THRESHOLD && spec.forcedType !== 'general'
          ? t('당해 연도 매출이 1억 400만 원 미만으로 유지되면 다음 해 7월 1일부터 간이과세 전환 통지 대상이 될 수 있습니다(초기 매입 많을 시 일반 유지 유리).', 'If turnover stays under 104M KRW, you may qualify to switch to Simplified next July 1 (unless initial input VAT refund is beneficial).')
          : t('1월(2기)·7월(1기) 연 2회 부가세 확정신고 및 4월·10월 예정고지/신고 일정이 적용됩니다.', 'Two final VAT filings per year (Jan & Jul) plus Apr/Oct interim assessments.');
    } else {
      taxpayerType = 'simplified';
      var isExemptPayment = annualGrossSales < VAT_EXEMPT_PAYMENT_THRESHOLD;
      determinedType = isExemptPayment ? 'simplified_exempt' : 'simplified_taxable';
      if (isExemptPayment) {
        title = t('간이과세자 — 부가가치세 납부의무 면제 (0원) 대상', 'Simplified Taxpayer — VAT Payment Exempt (<48M KRW)');
        subtitle = t(
          '연 매출이 4,800만 원 미만(' + formatCurrency(annualGrossSales) + ')으로 부가가치세 납부가 면제(0원)됩니다. 단, 1월 부가세 신고와 5월 종합소득세 신고는 반드시 진행해야 합니다.',
          'Annual revenue is under 48M KRW (' + formatCurrency(annualGrossSales) + '): VAT payment is exempt (0 KRW), though annual Jan VAT filing and May Income Tax filing are still required.'
        );
      } else {
        title = t(
          '간이과세자 — 부가세 낮게 납부(업종부가율 ' + spec.vatRatePct + '% · 실효세율 ' + (spec.vatRatePct * 0.1).toFixed(1) + '%) 대상',
          'Simplified Taxpayer — Reduced VAT (' + spec.vatRatePct + '% Value-Added Rate = ' + (spec.vatRatePct * 0.1).toFixed(1) + '% Effective)'
        );
        subtitle = t(
          '연환산 매출이 4,800만 원 이상 ~ 1억 400만 원 미만 구간으로 간이과세 세율이 적용되며, 카드·PG 매출 1.3% 발행세액공제로 실제 부가세 부담이 크게 줄어듭니다.',
          'Between 48M and 104M KRW: reduced simplified VAT applies, further offset by the 1.3% card/PG tax credit.'
        );
      }
      legalBasis = t('부가가치세법 제61조(1억 400만 원) · 제63조(업종별 부가가치율 및 0.5% 매입공제) · 제69조(4,800만 원 납부면제)', 'VAT Act Art. 61 (104M Limit) · Art. 63 (Industry Rate & 0.5% Credit) · Art. 69 (48M Exemption)');
      invoiceDutyText = isExemptPayment
        ? t('연 매출 4,800만 원 미만 간이과세자는 세금계산서 발급 불가 (현금영수증·영수증·PG결제 처리, B2B 거래처 주의)', 'Cannot issue tax invoices below 48M KRW (issues receipts/cash receipts only)')
        : t('직전 연도 매출 4,800만 원 이상 간이과세자는 B2B 요청 시 세금계산서 발급 의무 있음 (미발급 가산세 주의)', '48M~104M KRW simplified taxpayers MUST issue tax invoices when requested by B2B buyers');
      if (annualGrossSales >= VAT_SIMPLIFIED_THRESHOLD) {
        conversionAlertText = t(
          '주의: 당해 연환산 매출(' + formatCurrency(annualGrossSales) + ')이 1억 400만 원을 넘었으므로 내년 7월 1일부터 일반과세자(10%)로 자동 전환됩니다!',
          'Alert: Current annualized sales (' + formatCurrency(annualGrossSales) + ') exceed 104M KRW — automatic conversion to General Taxpayer takes effect next July 1!'
        );
      } else {
        conversionAlertText = t(
          '매년 1월 1일~25일 1년에 한 번만 부가세를 신고하며, 환급은 불가하지만 매출 부가세율이 일반과세(10%) 대비 매우 낮습니다.',
          'Files VAT once a year (Jan 1–25). Non-refundable, with significantly lower effective VAT than General.'
        );
      }
    }

    // 2. 부가가치세 비교 계산 (일반과세 vs 간이과세 동일 조건 대조)
    var qualifiedRatio = 1 - nonQualifiedExpenseRatio / 100;
    var qualifiedCosts = totalCashCosts * qualifiedRatio;
    var cardRatio = cardSalesRatio / 100;
    var priorSupplyForCard = basisSalesForVat / 1.1;
    var cardCreditEligibleOwner = priorSupplyForCard <= CARD_CREDIT_PRIOR_SUPPLY_LIMIT;

    // 일반과세 기준 부가세
    var gOutputVat = Math.round(annualGrossSales / 11);
    var gInputVat = Math.round(qualifiedCosts / 11);
    var gBeforeCredit = gOutputVat - gInputVat;
    var gRawCard = cardCreditEligibleOwner ? Math.min(CARD_ISSUANCE_CREDIT_CAP, Math.round(annualGrossSales * cardRatio * CARD_ISSUANCE_CREDIT_RATE)) : 0;
    var gCardCredit = gBeforeCredit > 0 ? Math.min(gBeforeCredit, gRawCard) : 0;
    var gAfterCard = gBeforeCredit - gCardCredit;
    var gEFiling = includeEFilingCredit && gAfterCard > 0 ? Math.min(gAfterCard, 20000) : 0;
    var gFinalVat = gAfterCard - gEFiling;

    // 간이과세 기준 부가세
    var sOutputVat = Math.round(annualGrossSales * 0.1 * (spec.vatRatePct / 100));
    var sRawInputCredit = Math.round(qualifiedCosts * 0.005);
    var sInputCredit = Math.min(sOutputVat, sRawInputCredit);
    var sBeforeCredit = Math.max(0, sOutputVat - sInputCredit);
    var sExemptApplied = taxpayerType === 'simplified' && determinedType === 'simplified_exempt';
    var sCardCredit = 0;
    var sEFiling = 0;
    var sFinalVat = 0;
    if (!sExemptApplied) {
      var sRawCard = cardCreditEligibleOwner ? Math.min(CARD_ISSUANCE_CREDIT_CAP, Math.round(annualGrossSales * cardRatio * CARD_ISSUANCE_CREDIT_RATE)) : 0;
      sCardCredit = Math.min(sBeforeCredit, sRawCard);
      var sAfterCard = Math.max(0, sBeforeCredit - sCardCredit);
      sEFiling = includeEFilingCredit && sAfterCard > 0 ? Math.min(sAfterCard, 10000) : 0;
      sFinalVat = Math.max(0, sAfterCard - sEFiling);
    }

    var activeVat;
    if (taxpayerType === 'exempt') {
      activeVat = {
        outputVat: 0,
        inputVatCredit: 0,
        vatBeforeCredits: 0,
        cardIssuanceCredit: 0,
        eFilingCredit: 0,
        finalAnnualVat: 0,
        isRefund: false,
        semiAnnualVat: 0,
        exemptApplied: false
      };
    } else if (taxpayerType === 'general') {
      activeVat = {
        outputVat: gOutputVat,
        inputVatCredit: gInputVat,
        vatBeforeCredits: gBeforeCredit,
        cardIssuanceCredit: gCardCredit,
        eFilingCredit: gEFiling,
        finalAnnualVat: gFinalVat,
        isRefund: gFinalVat < 0,
        semiAnnualVat: Math.round(gFinalVat / 2),
        exemptApplied: false
      };
    } else {
      activeVat = {
        outputVat: sOutputVat,
        inputVatCredit: sInputCredit,
        vatBeforeCredits: sExemptApplied ? 0 : sBeforeCredit,
        cardIssuanceCredit: sCardCredit,
        eFilingCredit: sEFiling,
        finalAnnualVat: sFinalVat,
        isRefund: false,
        semiAnnualVat: sFinalVat,
        exemptApplied: sExemptApplied
      };
    }

    var vatComparisonNote = '';
    if (taxpayerType === 'exempt') {
      vatComparisonNote = t('면세사업자는 부가가치세 신고·납부 대상이 아닙니다.', 'VAT-exempt business is excluded from VAT comparison.');
    } else if (gFinalVat < sFinalVat) {
      vatComparisonNote = t(
        '매입 비중이 높거나 초기 투자/적자 구조여서 일반과세(환급 포함 ' + formatCurrency(gFinalVat) + ')가 간이과세(' + formatCurrency(sFinalVat) + ')보다 부가세 ' + formatCurrency(sFinalVat - gFinalVat) + ' 더 유리합니다.',
        'High input ratio makes General VAT (' + formatCurrency(gFinalVat) + ') cheaper by ' + formatCurrency(sFinalVat - gFinalVat) + ' than Simplified (' + formatCurrency(sFinalVat) + ').'
      );
    } else {
      vatComparisonNote = t(
        '동일 매출 대비 간이과세(' + formatCurrency(sFinalVat) + ')가 일반과세(' + formatCurrency(gFinalVat) + ')보다 부가세 부담이 ' + formatCurrency(gFinalVat - sFinalVat) + ' 적습니다.',
        'Simplified VAT (' + formatCurrency(sFinalVat) + ') saves ' + formatCurrency(gFinalVat - sFinalVat) + ' vs General (' + formatCurrency(gFinalVat) + ').'
      );
    }

    activeVat.comparison = {
      generalVat: gFinalVat,
      simplifiedVat: sFinalVat,
      simplifiedApplicable: spec.forcedType !== 'general' && annualGrossSales < VAT_SIMPLIFIED_THRESHOLD,
      note: vatComparisonNote
    };
    activeVat.cardCreditEligibleOwner = cardCreditEligibleOwner;

    // 3. 종합소득세 및 기장의무 판정 (현행 소득세법 제55조, 제160조, 시행령 제143조, 제208조)
    var incomeBasisRev = taxpayerType === 'general' ? Math.round(annualGrossSales / 1.1) : annualGrossSales;
    var priorRevForIncome = isNewBusiness
      ? 0
      : priorYearGrossSales !== null
      ? taxpayerType === 'general'
        ? Math.round(priorYearGrossSales / 1.1)
        : priorYearGrossSales
      : incomeBasisRev;

    var isDoubleEntry = !isNewBusiness && priorRevForIncome >= spec.doubleEntryLimit;
    var bookkeepingDuty = isDoubleEntry ? 'double_entry' : 'simple_book';
    var isSincereFiling = incomeBasisRev >= spec.sincereFilingLimit;

    var expenseRateEligibility = isNewBusiness
      ? incomeBasisRev < spec.doubleEntryLimit
        ? 'simple_rate'
        : 'standard_rate'
      : priorRevForIncome < spec.simpleExpenseContLimit
      ? 'simple_rate'
      : 'standard_rate';

    var nonQualifiedAmount = Math.round(totalCashCosts * (1 - qualifiedRatio));
    var actualDeductibleExpenses;
    if (taxpayerType === 'general') {
      actualDeductibleExpenses = Math.round(qualifiedCosts / 1.1) + nonQualifiedAmount;
    } else if (taxpayerType === 'simplified') {
      actualDeductibleExpenses = Math.round(totalCashCosts + activeVat.finalAnnualVat);
    } else {
      actualDeductibleExpenses = Math.round(totalCashCosts);
    }

    var actualBusinessIncome = incomeBasisRev - actualDeductibleExpenses;
    var actualBook = computeProgressiveIncomeTax(actualBusinessIncome, {
      dependentsCount: dependentsCount,
      extraDeduction: extraDeduction,
      applyDoubleCredit: bookkeepingDuty === 'simple_book' && useDoubleEntryCredit,
      includeEFilingCredit: includeEFilingCredit
    });
    actualBook.revenueSupply = incomeBasisRev;
    actualBook.deductibleExpenses = actualDeductibleExpenses;
    actualBook.nonQualifiedAmount = nonQualifiedAmount;

    // 추계신고(단순경비율 vs 기준경비율) 계산
    var estExpenses = 0;
    var estMethodLabel = '';
    var estWarningText = '';
    if (expenseRateEligibility === 'simple_rate') {
      estExpenses = Math.round(
        Math.min(40000000, incomeBasisRev) * spec.simpleRateBase +
          Math.max(0, incomeBasisRev - 40000000) * spec.simpleRateExcess
      );
      estMethodLabel = t(
        '단순경비율 추계 (' + (spec.simpleRateBase * 100).toFixed(1) + '% / 4천초과 ' + (spec.simpleRateExcess * 100).toFixed(1) + '%)',
        'Simple Expense Rate (' + (spec.simpleRateBase * 100).toFixed(1) + '%)'
      );
      if (!isNewBusiness && priorRevForIncome >= VAT_EXEMPT_PAYMENT_THRESHOLD && bookkeepingDuty === 'simple_book') {
        estWarningText = t('직전 연도 수입 4,800만 원 이상 사업자가 장부 없이 추계신고 시 무기장가산세(산출세액 20%)가 부과될 수 있습니다.', 'Filing without books above 48M KRW prior income risks a 20% non-bookkeeping penalty.');
      } else {
        estWarningText = t('실제 마진율보다 단순경비율(국세청 인정 경비율)이 높으면 추계신고가 유리할 수 있습니다.', 'Simple rate helps when statutory expense rate exceeds your actual cost ratio.');
      }
    } else {
      var majorSupply = taxpayerType === 'general' ? Math.round((annualCogs + annualOther) / 1.1) : annualCogs + annualOther;
      estExpenses = Math.round(majorSupply + incomeBasisRev * spec.standardRate);
      estMethodLabel = t(
        '기준경비율 추계 (주요경비 + 매출 × ' + (spec.standardRate * 100).toFixed(1) + '%)',
        'Standard Expense Rate (Major Costs + ' + (spec.standardRate * 100).toFixed(1) + '%)'
      );
      estWarningText =
        bookkeepingDuty === 'double_entry'
          ? t('복식부기의무자는 추계신고 시 무신고가산세(20%) 및 기장불성실 불이익 대상이므로 반드시 복식부기 장부로 신고하세요.', 'Double-entry obligors face 20% penalties if estimating — file using full accounting books.')
          : t('간편장부대상자라도 직전 4,800만 원 이상이면 기준경비율 선택 시 무기장가산세 20%가 부과될 수 있습니다.', 'Standard-rate estimation may incur a 20% non-bookkeeping penalty if prior income >= 48M KRW.');
    }

    var estBusinessIncome = Math.max(0, incomeBasisRev - estExpenses);
    var estimatedRate = computeProgressiveIncomeTax(estBusinessIncome, {
      dependentsCount: dependentsCount,
      extraDeduction: extraDeduction,
      applyDoubleCredit: false,
      includeEFilingCredit: includeEFilingCredit
    });
    estimatedRate.revenueSupply = incomeBasisRev;
    estimatedRate.recognizedExpenses = estExpenses;
    estimatedRate.methodLabel = estMethodLabel;
    estimatedRate.warningText = estWarningText;

    var recommendedMethodText = '';
    if (bookkeepingDuty === 'double_entry') {
      recommendedMethodText = t(
        '복식부기의무자이므로 실제 장부기장 신고가 법적 필수입니다. 세무대리인 기장 또는 복식부기 프로그램 신고를 권장합니다.',
        'Double-entry bookkeeping is legally mandatory; file with actual accounting books.'
      );
    } else if (actualBook.totalIncomeTax <= estimatedRate.totalIncomeTax) {
      recommendedMethodText = t(
        '실제 장부기장(간편장부/복식기장) 신고가 추계신고보다 총 소득세를 ' +
          formatCurrency(estimatedRate.totalIncomeTax - actualBook.totalIncomeTax) +
          ' 더 절약합니다.' +
          (actualBook.hasLoss ? ' (적자 발생 시 이월결손금 15년 공제 가능!)' : ''),
        'Actual Bookkeeping saves ' + formatCurrency(estimatedRate.totalIncomeTax - actualBook.totalIncomeTax) + ' over estimated expense filing.'
      );
    } else if (expenseRateEligibility === 'simple_rate' && (isNewBusiness || priorRevForIncome < VAT_EXEMPT_PAYMENT_THRESHOLD)) {
      recommendedMethodText = t(
        '단순경비율(' + estMethodLabel + ') 추계신고가 실제 장부보다 ' +
          formatCurrency(actualBook.totalIncomeTax - estimatedRate.totalIncomeTax) +
          ' 유리할 수 있습니다. (단, 실제 적자·이월결손 공제 필요 시 장부기장 선택)',
        'Simple Expense Rate saves ' + formatCurrency(actualBook.totalIncomeTax - estimatedRate.totalIncomeTax) + ' vs actual books.'
      );
    } else {
      recommendedMethodText = t(
        '무기장가산세(20%) 리스크를 피하고 실제 수수료·택배비·광고비를 모두 인정받으려면 간편장부(또는 복식기장 20% 공제) 신고가 가장 안전합니다.',
        'Use Simple/Double-Entry Bookkeeping to deduct actual fees, shipping, and ad spend without penalty.'
      );
    }

    var bookkeepingLabel =
      bookkeepingDuty === 'double_entry'
        ? t('복식부기의무자 (재무상태표·손익계산서·사업용계좌 필수)', 'Double-Entry Bookkeeping Obligor (Balance Sheet & Business Account Required)')
        : t('간편장부대상자 (간편장부 작성 또는 복식기장 시 산출세액 20% 공제)', 'Simple Bookkeeping Eligible (20% Credit if filing Double-Entry)');

    if (isSincereFiling) {
      bookkeepingLabel += t(' · [성실신고확인대상자(6월말)]', ' · [Sincere Filing Confirmation Required]');
    }

    // 4. 종합 세금 요약 및 월 적립 가이드
    var annualVatPayable = activeVat.finalAnnualVat;
    var annualIncomeTaxTotal = actualBook.totalIncomeTax;
    var totalTaxBurden = annualVatPayable + annualIncomeTaxTotal;
    var afterTaxNetProfit = preTaxCashProfit - totalTaxBurden;
    var effectiveTaxRateOnSales = annualGrossSales > EPSILON ? (totalTaxBurden / annualGrossSales) * 100 : 0;
    var effectiveTaxRateOnProfit = preTaxCashProfit > EPSILON ? (totalTaxBurden / preTaxCashProfit) * 100 : 0;
    var monthlyTaxReserve = Math.max(0, Math.round(totalTaxBurden / 12));

    // 5. 맞춤형 세무 신고 방법 & 일정 생성
    var filingSchedule = [];
    if (taxpayerType === 'exempt') {
      filingSchedule.push({
        period: t('매년 2월 10일까지', 'By Feb 10 Annually'),
        title: t('면세사업자 사업장현황신고', 'VAT-Exempt Business Status Report'),
        target: t('면세 매출·매입계산서 합계 확인 및 제출', 'Submit annual tax-free revenue & invoice summary'),
        hometaxPath: t('국세청 홈택스 > 세금신고 > 부가가치세·사업장현황신고 > 면세사업자 사업장현황신고', 'HomeTax > Tax Filing > Business Status Report'),
        highlight: true
      });
    } else if (taxpayerType === 'simplified') {
      filingSchedule.push({
        period: t('매년 1월 1일 ~ 1월 25일', 'Jan 1 – Jan 25 Annually'),
        title: t('간이과세자 부가가치세 확정신고 (연 1회)', 'Simplified VAT Annual Final Return'),
        target: activeVat.exemptApplied
          ? t('예상 납부세액 0원 (연 4,800만 원 미만 납부면제 — 단, 매출액 신고는 필수)', '0 KRW payable (Exempt under 48M KRW — filing is still required)')
          : t('연간 예상 납부세액 ' + formatCurrency(annualVatPayable) + ' (카드 1.3% 공제 반영)', 'Est. Payable: ' + formatCurrency(annualVatPayable) + ' (incl. 1.3% card credit)'),
        hometaxPath: t('국세청 홈택스 > 세금신고 > 부가가치세 신고 > 간이과세자 정기신고 (마켓 매출 자동 조회 확인)', 'HomeTax > Tax Filing > VAT > Simplified Final Return'),
        highlight: true
      });
      if (!activeVat.exemptApplied) {
        filingSchedule.push({
          period: t('매년 7월 1일 ~ 7월 25일 (해당 시)', 'Jul 1 – Jul 25 (If Applicable)'),
          title: t('간이과세자 예정부과 납부 / 예정신고', 'Simplified VAT Interim Assessment / Return'),
          target: t('전반기 세금계산서를 발급했거나 일반→간이 전환자·실적 급감(1/3 미만) 시 신고/납부', 'Applies if issuing B2B tax invoices or notified for interim assessment'),
          hometaxPath: t('국세청 홈택스 > 세금신고 > 부가가치세 신고 > 예정신고', 'HomeTax > Tax Filing > VAT > Interim Return'),
          highlight: false
        });
      }
    } else {
      filingSchedule.push({
        period: t('매년 7월 25일 (1기) · 익년 1월 25일 (2기)', 'Jul 25 (H1) & Jan 25 (H2)'),
        title: t('일반과세자 부가가치세 확정신고 (연 2회)', 'General VAT Semi-Annual Final Returns'),
        target:
          annualVatPayable >= 0
            ? t('반기 평균 약 ' + formatCurrency(Math.round(annualVatPayable / 2)) + ' (연 ' + formatCurrency(annualVatPayable) + ')', '~' + formatCurrency(Math.round(annualVatPayable / 2)) + ' per half-year (' + formatCurrency(annualVatPayable) + '/yr)')
            : t('매입세액 초과 연간 약 ' + formatCurrency(Math.abs(annualVatPayable)) + ' 환급 예상', 'Est. annual VAT refund of ' + formatCurrency(Math.abs(annualVatPayable))),
        hometaxPath: t('국세청 홈택스 > 세금신고 > 부가가치세 신고 > 일반과세자 정기신고 (오픈마켓 대행 매출자료 불러오기)', 'HomeTax > Tax Filing > VAT > General Final Return'),
        highlight: true
      });
      filingSchedule.push({
        period: t('매년 4월 25일 · 10월 25일', 'Apr 25 & Oct 25'),
        title: t('일반과세자 부가세 예정고지 납부 (또는 조기환급)', 'General VAT Quarterly Interim Assessment'),
        target: t('직전 과세기간 납부세액의 50% 고지서 납부 (고지세액 50만 원 미만 생략, 적자 시 예정신고 선택)', 'Pay 50% prior-period VAT bill (waived if <500K KRW)'),
        hometaxPath: t('국세청 홈택스 > 조회/발급 > 세금신고납부 > 납부할 세액 조회', 'HomeTax > Tax Payment Lookup'),
        highlight: false
      });
    }

    filingSchedule.push({
      period: isSincereFiling ? t('매년 5월 1일 ~ 6월 30일 (성실신고확인)', 'May 1 – Jun 30 (Sincere Filing)') : t('매년 5월 1일 ~ 5월 31일', 'May 1 – May 31 Annually'),
      title: t('종합소득세 · 개인지방소득세 확정신고', 'Comprehensive & Local Income Tax Filing'),
      target: t(
        bookkeepingDuty === 'double_entry'
          ? '예상 세액 ' + formatCurrency(annualIncomeTaxTotal) + ' (복식부기 재무제표 첨부 필수, 세무사 검토 권장)'
          : '장부신고 예상 ' + formatCurrency(annualIncomeTaxTotal) + ' (세후 10% 지방소득세 자동 연계 신고)',
        'Est. ' + formatCurrency(annualIncomeTaxTotal) + ' (HomeTax + WeTax local income tax linked)'
      ),
      hometaxPath: t('국세청 홈택스 > 세금신고 > 종합소득세 신고 > 일반신고(또는 모두채움) → 완료 후 위택스 지방소득세 원클릭 납부', 'HomeTax > Income Tax Return -> WeTax Linked Local Tax'),
      highlight: true
    });

    var checklists = [
      t('오픈마켓(스마트스토어·쿠팡) 매출집계: 홈택스 [세금신고 > 부가가치세 > 조회서비스 > 신용카드·판매대행 매출자료 조회]에서 누락 없이 불러오세요.', 'Verify marketplace PG/proxy sales directly in HomeTax Sales Data Lookup to prevent omitted or duplicated sales.'),
      t('매입세액 공제 누락 방지: 홈택스에 [사업용 신용카드]를 사전 등록하고, 마켓 수수료 세금계산서(월말/익월 초 마켓 정산센터 발급분)와 광고비 세금계산서를 꼭 매칭하세요.', 'Register your business credit card on HomeTax and collect monthly fee & ad tax invoices from marketplaces.'),
      t('세금 통장 분리 적립: 계산된 매월 예상 적립액(' + formatCurrency(monthlyTaxReserve) + ')을 정산금 입금 시 별도 통장으로 이체해 두면 1·5·7월 세금 폭탄을 막을 수 있습니다.', 'Transfer ' + formatCurrency(monthlyTaxReserve) + '/month into a dedicated tax reserve account upon payout.')
    ];
    if (bookkeepingDuty === 'double_entry') {
      checklists.push(t('복식부기의무자 필수 조치: 사업용계좌 홈택스 사전 등록 및 인건비·임차료 원천세(매월 10일) 신고 여부를 점검하세요.', 'Double-Entry Obligor: Ensure a dedicated business bank account is registered on HomeTax.'));
    }
    if (nonQualifiedAmount > 0) {
      checklists.push(t('적격증빙 미수취 지출 주의: 연간 ' + formatCurrency(nonQualifiedAmount) + '의 비적격 지출은 건당 3만 원 초과 시 증빙불비 가산세(2%) 대상이 될 수 있습니다.', 'Non-qualified expenses (' + formatCurrency(nonQualifiedAmount) + ') over 30K KRW/tx risk a 2% surcharge.'));
    }

    return {
      inputs: normalizedInputs,
      spec: spec,
      annualized: annualized,
      classification: {
        determinedType: determinedType,
        taxpayerType: taxpayerType,
        title: title,
        subtitle: subtitle,
        legalBasis: legalBasis,
        invoiceDutyText: invoiceDutyText,
        conversionAlertText: conversionAlertText,
        thresholds: {
          exemptLimit: VAT_EXEMPT_PAYMENT_THRESHOLD,
          simpleExpenseContLimit: spec.simpleExpenseContLimit,
          simplifiedLimit: VAT_SIMPLIFIED_THRESHOLD,
          doubleEntryLimit: spec.doubleEntryLimit,
          sincereFilingLimit: spec.sincereFilingLimit
        }
      },
      vat: activeVat,
      incomeTax: {
        bookkeepingDuty: bookkeepingDuty,
        bookkeepingLabel: bookkeepingLabel,
        isSincereFiling: isSincereFiling,
        expenseRateEligibility: expenseRateEligibility,
        actualBook: actualBook,
        estimatedRate: estimatedRate,
        recommendedMethodText: recommendedMethodText
      },
      summary: {
        annualGrossSales: annualGrossSales,
        preTaxCashProfit: preTaxCashProfit,
        annualVatPayable: annualVatPayable,
        annualIncomeTaxTotal: annualIncomeTaxTotal,
        totalTaxBurden: totalTaxBurden,
        afterTaxNetProfit: afterTaxNetProfit,
        effectiveTaxRateOnSales: effectiveTaxRateOnSales,
        effectiveTaxRateOnProfit: effectiveTaxRateOnProfit,
        monthlyTaxReserve: monthlyTaxReserve
      },
      filingSchedule: filingSchedule,
      checklists: checklists
    };
  }

  /* ==========================================================================
     5대 셀러 실전 확장 기능:
     1) 마켓별 수수료 프리셋·비교  2) 해외(1688) 수입원가·관부가세
     3) 반품·재고 손익분기          4) 선정산·대출 마진 잠식
     5) 원클릭 공유 URL & 1장짜리 Canvas PNG 리포트 카드 저장
     ========================================================================== */

  var MARKETPLACE_PRESETS = [
    {
      key: 'smartstore_linked',
      nameKo: '스마트스토어 (검색연동)',
      nameEn: 'SmartStore (Search)',
      feeRate: 5.63,
      shippingFeeRate: 3.63,
      feeBasisMode: 'customer_payment',
      noteKo: '주문관리 ~3.63% + 네이버쇼핑 연동 2%',
      noteEn: 'Order mgmt ~3.63% + Search 2%'
    },
    {
      key: 'smartstore_direct',
      nameKo: '스마트스토어 (직접유입)',
      nameEn: 'SmartStore (Direct)',
      feeRate: 3.63,
      shippingFeeRate: 3.63,
      feeBasisMode: 'customer_payment',
      noteKo: '네이버쇼핑 연동 제외 직접 유입',
      noteEn: 'Direct link / SNS traffic'
    },
    {
      key: 'coupang_general',
      nameKo: '쿠팡 마켓 (일반)',
      nameEn: 'Coupang (General)',
      feeRate: 10.8,
      shippingFeeRate: 3.3,
      feeBasisMode: 'customer_payment',
      noteKo: '일반 카테고리 평균 10.8% + 배송 3.3%',
      noteEn: 'Avg 10.8% + Shipping 3.3%'
    },
    {
      key: 'coupang_digital',
      nameKo: '쿠팡 마켓 (가전·디지털)',
      nameEn: 'Coupang (Digital)',
      feeRate: 7.8,
      shippingFeeRate: 3.3,
      feeBasisMode: 'customer_payment',
      noteKo: '디지털·가전 7.8% + 배송 3.3%',
      noteEn: 'Digital 7.8% + Shipping 3.3%'
    },
    {
      key: 'openmarket_11st_gmarket',
      nameKo: '11번가 · G마켓 · 옥션',
      nameEn: '11st / Gmarket / Auction',
      feeRate: 13.0,
      shippingFeeRate: 3.3,
      feeBasisMode: 'customer_payment',
      noteKo: '오픈마켓 일반 카테고리 평균 ~13%',
      noteEn: 'Open market avg ~13%'
    },
    {
      key: 'fashion_ably_zigzag',
      nameKo: '에이블리 · 지그재그',
      nameEn: 'Ably / Zigzag',
      feeRate: 11.0,
      shippingFeeRate: 3.3,
      feeBasisMode: 'customer_payment',
      noteKo: '패션 플랫폼 평균 수수료 ~11%',
      noteEn: 'Fashion vertical avg ~11%'
    },
    {
      key: 'own_mall_pg',
      nameKo: '자사몰 (PG 기본)',
      nameEn: 'Own Store (PG)',
      feeRate: 3.3,
      shippingFeeRate: 3.3,
      feeBasisMode: 'total_payment_with_shipping',
      noteKo: '카페24/아임웹 PG 결제 ~3.3%',
      noteEn: 'D2C PG gateway ~3.3%'
    }
  ];

  function compareMarketplaces(baseInputs) {
    var base = normalizeInputs(baseInputs || cloneDefaults());
    var items = MARKETPLACE_PRESETS.map(function (preset) {
      var merged = Object.assign({}, base, {
        feeRate: preset.feeRate,
        shippingFeeRate: preset.shippingFeeRate,
        feeBasisMode: preset.feeBasisMode
      });
      var profit = calculateProfit(merged);
      var roas = calculateRoas(merged);
      return {
        preset: preset,
        inputs: merged,
        profit: profit,
        roas: roas,
        diffFromBest: 0
      };
    });

    var bestItem = items[0];
    var worstItem = items[0];
    for (var i = 1; i < items.length; i++) {
      if (items[i].profit.operatingProfit > bestItem.profit.operatingProfit) {
        bestItem = items[i];
      }
      if (items[i].profit.operatingProfit < worstItem.profit.operatingProfit) {
        worstItem = items[i];
      }
    }

    for (var j = 0; j < items.length; j++) {
      items[j].diffFromBest = items[j].profit.operatingProfit - bestItem.profit.operatingProfit;
    }

    return {
      items: items,
      bestMarketKey: bestItem.preset.key,
      worstMarketKey: worstItem.preset.key,
      maxSpreadKrw: bestItem.profit.operatingProfit - worstItem.profit.operatingProfit
    };
  }

  function mountMarketPresetPills(container, onSelectPreset, initialActiveKey) {
    if (!container || typeof document === 'undefined') return null;
    var activeKey = initialActiveKey || '';

    function render() {
      clearEl(container);
      var bar = createEl('div', 'market-preset-bar');
      bar.appendChild(createEl('span', 'market-preset-title', t('마켓 수수료 빠른 선택:', 'Quick Market Fee Presets:')));

      var pillsWrap = createEl('div', 'market-preset-pills');
      MARKETPLACE_PRESETS.forEach(function (preset) {
        var isAct = preset.key === activeKey;
        var label = (currentLang === 'en' ? preset.nameEn : preset.nameKo) + ' ' + preset.feeRate + '%';
        var btn = createEl('button', 'market-preset-chip' + (isAct ? ' active' : ''), label);
        btn.type = 'button';
        btn.title = currentLang === 'en' ? preset.noteEn : preset.noteKo;
        btn.addEventListener('click', function () {
          activeKey = preset.key;
          if (typeof onSelectPreset === 'function') {
            onSelectPreset(preset);
          }
          render();
        });
        pillsWrap.appendChild(btn);
      });
      bar.appendChild(pillsWrap);
      container.appendChild(bar);
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('sellermath:langchange', render);
    }
    render();

    return {
      syncActiveByInputs: function (inp) {
        if (!inp) return;
        var matchedKey = '';
        for (var i = 0; i < MARKETPLACE_PRESETS.length; i++) {
          var p = MARKETPLACE_PRESETS[i];
          if (
            Math.abs(Number(inp.feeRate) - p.feeRate) < 1e-4 &&
            Math.abs(Number(inp.shippingFeeRate) - p.shippingFeeRate) < 1e-4 &&
            inp.feeBasisMode === p.feeBasisMode
          ) {
            matchedKey = p.key;
            break;
          }
        }
        if (matchedKey !== activeKey) {
          activeKey = matchedKey;
          render();
        }
      }
    };
  }

  function calculateImportCogs(rawImport) {
    var src = rawImport && typeof rawImport === 'object' ? rawImport : {};
    var currency = src.currency === 'USD' ? 'USD' : 'CNY';
    var foreignUnitPrice = toNonNegativeNumber(src.foreignUnitPrice, 25);
    var exchangeRate = Math.max(1, toNonNegativeNumber(src.exchangeRate, currency === 'USD' ? 1400 : 195));
    var orderQuantity = Math.max(1, Math.round(toNonNegativeNumber(src.orderQuantity, 100)));
    var localShippingForeign = toNonNegativeNumber(src.localShippingForeign, 30);
    var intlShippingKrw = toNonNegativeNumber(src.intlShippingKrw, 85000);
    var customsDutyRate = Math.min(100, toNonNegativeNumber(src.customsDutyRate, 8));
    var brokerAndClearanceFeeKrw = toNonNegativeNumber(src.brokerAndClearanceFeeKrw, 44000);
    var defectRatePct = Math.min(90, toNonNegativeNumber(src.defectRatePct, 2));

    var foreignGoodsTotal = foreignUnitPrice * orderQuantity;
    var cifTaxableValueKrw = Math.round((foreignGoodsTotal + localShippingForeign) * exchangeRate + intlShippingKrw);
    var customsDutyKrw = Math.round(cifTaxableValueKrw * (customsDutyRate / 100));
    var importVatKrw = Math.round((cifTaxableValueKrw + customsDutyKrw) * VAT_RATE);
    var brokerVatKrw = brokerAndClearanceFeeKrw - Math.round(brokerAndClearanceFeeKrw / (1 + VAT_RATE));
    var totalCashOutflowKrw = cifTaxableValueKrw + customsDutyKrw + importVatKrw + brokerAndClearanceFeeKrw;
    var totalRefundableVatKrw = importVatKrw + brokerVatKrw;
    var sellableQuantity = Math.max(1, Math.floor(orderQuantity * (1 - defectRatePct / 100)));

    var unitLandedCogsCash = Math.round(totalCashOutflowKrw / sellableQuantity);
    var unitLandedCogsSupply = Math.round((totalCashOutflowKrw - totalRefundableVatKrw) / sellableQuantity);

    return {
      inputs: {
        currency: currency,
        foreignUnitPrice: foreignUnitPrice,
        exchangeRate: exchangeRate,
        orderQuantity: orderQuantity,
        localShippingForeign: localShippingForeign,
        intlShippingKrw: intlShippingKrw,
        customsDutyRate: customsDutyRate,
        brokerAndClearanceFeeKrw: brokerAndClearanceFeeKrw,
        defectRatePct: defectRatePct
      },
      foreignGoodsTotal: foreignGoodsTotal,
      cifTaxableValueKrw: cifTaxableValueKrw,
      customsDutyKrw: customsDutyKrw,
      importVatKrw: importVatKrw,
      brokerVatKrw: brokerVatKrw,
      totalCashOutflowKrw: totalCashOutflowKrw,
      totalRefundableVatKrw: totalRefundableVatKrw,
      sellableQuantity: sellableQuantity,
      unitLandedCogsCash: unitLandedCogsCash,
      unitLandedCogsSupply: unitLandedCogsSupply
    };
  }

  function calculateReturnAndInventoryRisk(baseInputs, rawRisk) {
    var profitRes = calculateProfit(baseInputs || cloneDefaults());
    var src = rawRisk && typeof rawRisk === 'object' ? rawRisk : {};
    var returnRatePct = Math.min(95, toNonNegativeNumber(src.returnRatePct, 6));
    var roundTripReturnShippingKrw = toNonNegativeNumber(src.roundTripReturnShippingKrw, 6000);
    var returnRepackLossKrw = toNonNegativeNumber(src.returnRepackLossKrw, 1000);
    var inventoryBatchQty = Math.max(1, Math.round(toNonNegativeNumber(src.inventoryBatchQty, 100)));

    var r = returnRatePct / 100;
    var nominalUnitProfit = profitRes.operatingProfit;
    var lossPerReturnOrder = roundTripReturnShippingKrw + returnRepackLossKrw + profitRes.recognizedAdSpend;
    var expectedProfitPerOrder = (1 - r) * nominalUnitProfit - r * lossPerReturnOrder;
    var ordersNeededToCoverOneReturn = nominalUnitProfit > EPSILON ? lossPerReturnOrder / nominalUnitProfit : null;

    var totalBatchCogs = profitRes.recognizedCogs * inventoryBatchQty;
    var netSalesGainPerSuccessOrder =
      profitRes.recognizedRevenue - profitRes.recognizedFee - profitRes.recognizedShipping - profitRes.recognizedAdSpend;
    var unitContributionBeforeCogs = netSalesGainPerSuccessOrder - (r / Math.max(0.01, 1 - r)) * lossPerReturnOrder;

    var breakEvenSellQty = null;
    var breakEvenSellThroughPct = null;
    if (totalBatchCogs <= EPSILON) {
      breakEvenSellQty = 0;
      breakEvenSellThroughPct = 0;
    } else if (unitContributionBeforeCogs > EPSILON) {
      breakEvenSellQty = Math.ceil(totalBatchCogs / unitContributionBeforeCogs);
      breakEvenSellThroughPct = (breakEvenSellQty / inventoryBatchQty) * 100;
    }

    var isBatchRecoverable = breakEvenSellQty !== null && breakEvenSellQty <= inventoryBatchQty;
    var expectedMarginRate = profitRes.recognizedRevenue > EPSILON ? (expectedProfitPerOrder / profitRes.recognizedRevenue) * 100 : null;
    var expectedMonthlyProfit = expectedProfitPerOrder * profitRes.monthlyUnits;

    return {
      inputs: {
        returnRatePct: returnRatePct,
        roundTripReturnShippingKrw: roundTripReturnShippingKrw,
        returnRepackLossKrw: returnRepackLossKrw,
        inventoryBatchQty: inventoryBatchQty
      },
      profitResult: profitRes,
      nominalUnitProfit: nominalUnitProfit,
      lossPerReturnOrder: lossPerReturnOrder,
      expectedProfitPerOrder: expectedProfitPerOrder,
      expectedMarginRate: expectedMarginRate,
      expectedMonthlyProfit: expectedMonthlyProfit,
      ordersNeededToCoverOneReturn: ordersNeededToCoverOneReturn,
      totalBatchCogs: totalBatchCogs,
      unitContributionBeforeCogs: unitContributionBeforeCogs,
      breakEvenSellQty: breakEvenSellQty,
      breakEvenSellThroughPct: breakEvenSellThroughPct,
      isBatchRecoverable: isBatchRecoverable
    };
  }

  function calculateFinancingImpact(baseInputs, rawFin) {
    var profitRes = calculateProfit(baseInputs || cloneDefaults());
    var src = rawFin && typeof rawFin === 'object' ? rawFin : {};
    var earlyPayAdvanceDays = Math.min(180, toNonNegativeNumber(src.earlyPayAdvanceDays, 35));
    var earlyPayDailyFeeRatePct = Math.min(5, toNonNegativeNumber(src.earlyPayDailyFeeRatePct, 0.035));
    var loanAmountKrw = toNonNegativeNumber(src.loanAmountKrw, 20000000);
    var loanAnnualRatePct = Math.min(100, toNonNegativeNumber(src.loanAnnualRatePct, 6.5));

    var earlyPayFeePerOrder = profitRes.platformSettlement * (earlyPayDailyFeeRatePct / 100) * earlyPayAdvanceDays;
    var earlyPayEffectiveAprPct = earlyPayDailyFeeRatePct * 365;
    var unitProfitAfterEarlyPay = profitRes.operatingProfit - earlyPayFeePerOrder;
    var marginDropPctPoints = profitRes.recognizedRevenue > EPSILON ? (earlyPayFeePerOrder / profitRes.recognizedRevenue) * 100 : 0;

    var monthlyEarlyPayCost = earlyPayFeePerOrder * profitRes.monthlyUnits;
    var monthlyLoanInterest = Math.round((loanAmountKrw * (loanAnnualRatePct / 100)) / 12);
    var monthlyProfitAfterEarlyPay = profitRes.monthlyOperatingProfit - monthlyEarlyPayCost;
    var monthlyProfitAfterLoan = profitRes.monthlyOperatingProfit - monthlyLoanInterest;

    var comparisonNote = '';
    if (monthlyEarlyPayCost > monthlyLoanInterest) {
      comparisonNote = t(
        '선정산 실효 연금리(' +
          formatPercent(earlyPayEffectiveAprPct) +
          ')가 대출 연금리(' +
          formatPercent(loanAnnualRatePct) +
          ')보다 높아 월 기준 ' +
          formatCurrency(monthlyEarlyPayCost - monthlyLoanInterest) +
          ' 더 많은 금융비용이 빠져나갑니다.',
        'Early-payout APR (' +
          formatPercent(earlyPayEffectiveAprPct) +
          ') costs ' +
          formatCurrency(monthlyEarlyPayCost - monthlyLoanInterest) +
          '/mo more than the loan (' +
          formatPercent(loanAnnualRatePct) +
          ').'
      );
    } else {
      comparisonNote = t(
        '현재 월 판매 규모에서는 선정산 월 수수료(' +
          formatCurrency(monthlyEarlyPayCost) +
          ')가 사업자 대출 월 이자(' +
          formatCurrency(monthlyLoanInterest) +
          ')보다 ' +
          formatCurrency(monthlyLoanInterest - monthlyEarlyPayCost) +
          ' 적습니다.',
        'At current volume, early payout fee (' +
          formatCurrency(monthlyEarlyPayCost) +
          ') is lower than loan interest (' +
          formatCurrency(monthlyLoanInterest) +
          '/mo).'
      );
    }

    return {
      inputs: {
        earlyPayAdvanceDays: earlyPayAdvanceDays,
        earlyPayDailyFeeRatePct: earlyPayDailyFeeRatePct,
        loanAmountKrw: loanAmountKrw,
        loanAnnualRatePct: loanAnnualRatePct
      },
      profitResult: profitRes,
      earlyPayFeePerOrder: earlyPayFeePerOrder,
      earlyPayEffectiveAprPct: earlyPayEffectiveAprPct,
      unitProfitAfterEarlyPay: unitProfitAfterEarlyPay,
      marginDropPctPoints: marginDropPctPoints,
      monthlyEarlyPayCost: monthlyEarlyPayCost,
      monthlyLoanInterest: monthlyLoanInterest,
      monthlyProfitAfterEarlyPay: monthlyProfitAfterEarlyPay,
      monthlyProfitAfterLoan: monthlyProfitAfterLoan,
      comparisonNote: comparisonNote
    };
  }

  var SHARE_PARAM_MAP = [
    ['s_nm', 'itemName', 'str'],
    ['s_lp', 'listPrice', 'num'],
    ['s_sd', 'sellerDiscount', 'num'],
    ['s_pd', 'platformDiscount', 'num'],
    ['s_pr', 'platformSubsidyReimbursed', 'bool'],
    ['s_cg', 'cogs', 'num'],
    ['s_fb', 'feeBasisMode', 'str'],
    ['s_fr', 'feeRate', 'num'],
    ['s_cfm', 'customFeeMode', 'str'],
    ['s_cfb', 'customFeeBase', 'num'],
    ['s_cs', 'customerShipping', 'num'],
    ['s_sc', 'sellerShippingCost', 'num'],
    ['s_sfr', 'shippingFeeRate', 'num'],
    ['s_ad', 'adSpend', 'num'],
    ['s_ab', 'accountingBasis', 'str'],
    ['s_tp', 'taxpayerType', 'str'],
    ['s_svr', 'simplifiedValueAddedRate', 'nullableNum'],
    ['s_dv', 'dailyVolume', 'num'],
    ['s_md', 'monthlyDays', 'num'],
    ['s_arb', 'adRevenueBasis', 'str'],
    ['s_tm', 'targetMode', 'str'],
    ['s_tpa', 'targetProfitAmount', 'num'],
    ['s_tmr', 'targetMarginRate', 'num'],
    ['s_sdt', 'sellerDiscountType', 'str'],
    ['s_sdr', 'sellerDiscountRate', 'num'],
    ['s_pdt', 'platformDiscountType', 'str'],
    ['s_pdr', 'platformDiscountRate', 'num']
  ];

  function buildShareUrl(inputs, baseUrl) {
    var inp = normalizeInputs(inputs || loadSharedInputs());
    var params = new URLSearchParams();
    SHARE_PARAM_MAP.forEach(function (spec) {
      var qKey = spec[0];
      var prop = spec[1];
      var kind = spec[2];
      var val = inp[prop];
      if (kind === 'bool') {
        params.set(qKey, val ? '1' : '0');
      } else if (kind === 'nullableNum') {
        if (val !== null && typeof val !== 'undefined' && val !== '') {
          params.set(qKey, String(val));
        }
      } else if (val !== null && typeof val !== 'undefined') {
        params.set(qKey, String(val));
      }
    });

    var originPath = baseUrl;
    if (!originPath) {
      if (typeof window !== 'undefined' && window.location) {
        originPath = window.location.origin + window.location.pathname;
      } else {
        originPath = 'https://seller-math.pages.dev/profit-calculator';
      }
    }
    var sep = originPath.indexOf('?') !== -1 ? '&' : '?';
    return originPath.split('#')[0] + sep + params.toString();
  }

  function parseShareUrlParams(searchStr) {
    var raw = typeof searchStr === 'string'
      ? searchStr
      : typeof window !== 'undefined' && window.location
      ? window.location.search
      : '';
    if (!raw || raw.indexOf('s_') === -1) return null;

    var clean = raw.charAt(0) === '?' ? raw.slice(1) : raw;
    var params = new URLSearchParams(clean);
    var foundAny = false;
    var merged = cloneDefaults();

    SHARE_PARAM_MAP.forEach(function (spec) {
      var qKey = spec[0];
      var prop = spec[1];
      var kind = spec[2];
      if (!params.has(qKey)) return;
      foundAny = true;
      var v = params.get(qKey);
      if (kind === 'bool') {
        merged[prop] = v === '1' || v === 'true';
      } else if (kind === 'nullableNum') {
        merged[prop] = v === '' ? null : Number(v);
      } else if (kind === 'num') {
        merged[prop] = Number(v);
      } else {
        merged[prop] = v;
      }
    });

    return foundAny ? normalizeInputs(merged) : null;
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function downloadReportCardPng(cardSpec) {
    if (typeof document === 'undefined') return false;
    var canvas = document.createElement('canvas');
    if (!canvas || typeof canvas.getContext !== 'function') return false;

    canvas.width = 1200;
    canvas.height = 720;
    var ctx = canvas.getContext('2d');
    if (!ctx) return false;

    var spec = cardSpec || {};
    var fontStack = '"Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

    // Page Background
    ctx.fillStyle = '#f2f4f6';
    ctx.fillRect(0, 0, 1200, 720);

    // Outer Report Sheet
    ctx.fillStyle = '#ffffff';
    drawRoundedRect(ctx, 36, 32, 1128, 656, 20);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Top Brand Accent Strip
    ctx.fillStyle = '#1d4ed8';
    drawRoundedRect(ctx, 36, 32, 1128, 8, 6);
    ctx.fill();

    // Brand Logo Badge
    ctx.fillStyle = '#1d4ed8';
    drawRoundedRect(ctx, 72, 64, 34, 34, 9);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 18px ' + fontStack;
    ctx.fillText('₩', 81, 88);

    ctx.fillStyle = '#0f172a';
    ctx.font = '800 22px ' + fontStack;
    ctx.fillText('SELLER MATH', 118, 88);

    ctx.fillStyle = '#64748b';
    ctx.font = '600 15px ' + fontStack;
    ctx.textAlign = 'right';
    ctx.fillText((spec.dateText || new Date().toISOString().slice(0, 10)) + '  |  seller-math.pages.dev', 1128, 86);
    ctx.textAlign = 'left';

    // Report Title & Subtitle
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 30px ' + fontStack;
    ctx.fillText(String(spec.title || 'SELLER MATH Report').slice(0, 48), 72, 146);

    ctx.fillStyle = '#475569';
    ctx.font = '500 17px ' + fontStack;
    ctx.fillText(String(spec.subtitle || '').slice(0, 75), 72, 178);

    // 4 KPI Cards Row
    var kpis = Array.isArray(spec.kpis) ? spec.kpis.slice(0, 4) : [];
    var cardW = 248;
    var gap = 21;
    var startX = 72;
    var kpiY = 206;

    for (var i = 0; i < kpis.length; i++) {
      var k = kpis[i];
      var kx = startX + i * (cardW + gap);
      var bgCol = k.tone === 'positive' ? '#f0fdf4' : k.tone === 'negative' ? '#fff1f2' : k.tone === 'highlight' ? '#f8fbff' : '#f8fafc';
      var bdCol = k.tone === 'positive' ? '#86efac' : k.tone === 'negative' ? '#fda4af' : k.tone === 'highlight' ? '#93c5fd' : '#cbd5e1';
      var valCol = k.tone === 'positive' ? '#047857' : k.tone === 'negative' ? '#be123c' : k.tone === 'highlight' ? '#1d4ed8' : '#0f172a';

      ctx.fillStyle = bgCol;
      drawRoundedRect(ctx, kx, kpiY, cardW, 132, 14);
      ctx.fill();
      ctx.strokeStyle = bdCol;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.font = '700 15px ' + fontStack;
      ctx.fillText(String(k.label || '').slice(0, 22), kx + 18, kpiY + 34);

      ctx.fillStyle = valCol;
      ctx.font = '800 28px ' + fontStack;
      ctx.fillText(String(k.value || '').slice(0, 18), kx + 18, kpiY + 78);

      ctx.fillStyle = '#64748b';
      ctx.font = '500 13px ' + fontStack;
      ctx.fillText(String(k.sub || '').slice(0, 28), kx + 18, kpiY + 110);
    }

    // Breakdown Table Section
    var rows = Array.isArray(spec.rows) ? spec.rows.slice(0, 6) : [];
    var tblY = 368;
    ctx.fillStyle = '#f8fafc';
    drawRoundedRect(ctx, 72, tblY, 1056, 256, 14);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var ry = tblY + 14 + r * 38;
      if (r % 2 === 1) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(74, ry, 1052, 36);
      }
      ctx.fillStyle = row.bold ? '#0f172a' : '#334155';
      ctx.font = (row.bold ? '800' : '600') + ' 16px ' + fontStack;
      ctx.textAlign = 'left';
      ctx.fillText(String(row.label || '').slice(0, 48), 96, ry + 24);

      ctx.fillStyle = row.tone === 'positive' ? '#047857' : row.tone === 'negative' ? '#be123c' : '#0f172a';
      ctx.font = (row.bold ? '800' : '700') + ' 17px ' + fontStack;
      ctx.textAlign = 'right';
      ctx.fillText(String(row.value || '').slice(0, 32), 1104, ry + 24);
      ctx.textAlign = 'left';
    }

    // Bottom Disclaimer Note
    ctx.fillStyle = '#64748b';
    ctx.font = '500 13px ' + fontStack;
    ctx.fillText(
      String(
        spec.footerNote ||
          t(
            '본 리포트는 100% 브라우저 로컬 연산 결과이며 참고용 추정치입니다. (https://seller-math.pages.dev/)',
            'Generated 100% locally in browser for reference only. (https://seller-math.pages.dev/)'
          )
      ),
      72,
      660
    );

    var filename = (spec.filename || 'seller-math-report-' + new Date().toISOString().slice(0, 10)) + '.png';
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(function (blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.setAttribute('download', filename);
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 1000);
      }, 'image/png');
    } else {
      var dataUrl = canvas.toDataURL('image/png');
      var link = document.createElement('a');
      link.href = dataUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    return true;
  }

  function mountSellerWorkbench(container, options) {
    if (!container || typeof document === 'undefined') return null;
    var opts = options || {};
    var getBase = typeof opts.getBaseInputs === 'function' ? opts.getBaseInputs : loadSharedInputs;

    var state = {
      activeTab: 'markets', // 'markets' | 'import' | 'risk' | 'financing'
      importInputs: {
        currency: 'CNY',
        foreignUnitPrice: 25,
        exchangeRate: 195,
        orderQuantity: 100,
        localShippingForeign: 30,
        intlShippingKrw: 85000,
        customsDutyRate: 8,
        brokerAndClearanceFeeKrw: 44000,
        defectRatePct: 2
      },
      riskInputs: {
        returnRatePct: 6,
        roundTripReturnShippingKrw: 6000,
        returnRepackLossKrw: 1000,
        inventoryBatchQty: 100
      },
      finInputs: {
        earlyPayAdvanceDays: 35,
        earlyPayDailyFeeRatePct: 0.035,
        loanAmountKrw: 20000000,
        loanAnnualRatePct: 6.5
      }
    };

    var tabsSpec = [
      { key: 'markets', ko: '🏪 7대 마켓 수익 비교', en: '🏪 7 Marketplaces Compare' },
      { key: 'import', ko: '🚢 중국 사입·관부가세 원가', en: '🚢 Import COGS & Customs' },
      { key: 'risk', ko: '📦 반품률·재고 손익분기', en: '📦 Return & Inventory BEP' },
      { key: 'financing', ko: '💳 선정산·대출이자 분석', en: '💳 Early Payout vs Loan' }
    ];

    function makeField(labelText, inputType, val, stepVal, onInputCb, selectOptions) {
      var wrap = createEl('div', 'field');
      var lbl = createEl('label', '', labelText);
      var el;
      if (selectOptions) {
        el = createEl('select', 'select-control');
        selectOptions.forEach(function (opt) {
          var o = createEl('option', '', opt.label);
          o.value = opt.value;
          el.appendChild(o);
        });
        el.value = String(val);
        el.addEventListener('change', function () {
          onInputCb(el.value);
        });
      } else {
        el = createEl('input', 'input-control');
        el.type = inputType || 'number';
        el.min = '0';
        if (stepVal) el.step = String(stepVal);
        el.value = String(val);
        el.addEventListener('input', function () {
          onInputCb(el.value);
        });
      }
      wrap.appendChild(lbl);
      wrap.appendChild(el);
      return wrap;
    }

    function makeResultBox(label, val, sub, tone) {
      var box = createEl('div', 'kpi-card ' + (tone ? 'kpi-' + tone : ''));
      box.appendChild(createEl('span', 'kpi-label', label));
      box.appendChild(createEl('strong', 'kpi-value', val));
      if (sub) box.appendChild(createEl('span', 'kpi-sub', sub));
      return box;
    }

    function renderActivePane(paneContainer) {
      clearEl(paneContainer);
      var base = getBase();

      if (state.activeTab === 'markets') {
        var cmp = compareMarketplaces(base);
        paneContainer.appendChild(
          createEl(
            'p',
            'helper-note',
            t(
              '현재 입력된 판매가·원가·배송비·광고비·VAT 조건을 기준으로 7개 대표 쇼핑몰별 실제 영업이익과 손익분기 ROAS를 비교합니다. (최대 순이익 격차: ' +
                formatCurrency(cmp.maxSpreadKrw) +
                ')',
              'Compares net operating profit and Break-Even ROAS across 7 marketplaces using your active item price & costs. (Profit spread: ' +
                formatCurrency(cmp.maxSpreadKrw) +
                ')'
            )
          )
        );

        var tblWrap = createEl('div', 'table-responsive');
        var tbl = createEl('table', 'data-table');
        var thead = createEl('thead');
        var htr = createEl('tr');
        [
          t('마켓 / 채널', 'Marketplace'),
          t('판매·배송 수수료', 'Fee Rate'),
          t('정산 예정액', 'Est. Payout'),
          t('영업 추정 이익', 'Est. Profit'),
          t('순마진율', 'Net Margin'),
          t('손익분기 ROAS', 'BE ROAS'),
          t('최고 대비', 'vs Best'),
          t('적용', 'Apply')
        ].forEach(function (h) {
          htr.appendChild(createEl('th', '', h));
        });
        thead.appendChild(htr);
        tbl.appendChild(thead);

        var tbody = createEl('tbody');
        cmp.items.forEach(function (item) {
          var isBest = item.preset.key === cmp.bestMarketKey;
          var tr = createEl('tr', isBest ? 'row-highlight' : '');
          var nameCell = createEl('td');
          nameCell.appendChild(createEl('strong', '', currentLang === 'en' ? item.preset.nameEn : item.preset.nameKo));
          if (isBest) {
            nameCell.appendChild(createEl('span', 'status-pill status-profit', t(' 최고 마진', ' Best')));
          }
          tr.appendChild(nameCell);
          tr.appendChild(createEl('td', '', item.preset.feeRate + '% / ' + item.preset.shippingFeeRate + '%'));
          tr.appendChild(createEl('td', 'num', formatCurrency(item.profit.platformSettlement)));
          tr.appendChild(
            createEl(
              'td',
              'num ' + (item.profit.operatingProfit >= 0 ? 'text-positive' : 'text-negative'),
              formatCurrency(item.profit.operatingProfit)
            )
          );
          tr.appendChild(createEl('td', 'num', item.profit.netMarginLabel));
          tr.appendChild(createEl('td', 'num', item.roas.breakEvenRoasLabel));
          tr.appendChild(createEl('td', 'num', isBest ? t('기준 (1위)', 'Best (#1)') : formatCurrency(item.diffFromBest)));

          var actTd = createEl('td');
          var applyBtn = createEl('button', 'btn btn-outline btn-table-sm', t('적용', 'Apply'));
          applyBtn.type = 'button';
          applyBtn.addEventListener('click', function () {
            if (typeof opts.onApplyMarketPreset === 'function') {
              opts.onApplyMarketPreset(item.preset);
            }
          });
          actTd.appendChild(applyBtn);
          tr.appendChild(actTd);
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        tblWrap.appendChild(tbl);
        paneContainer.appendChild(tblWrap);
        return;
      }

      if (state.activeTab === 'import') {
        var grid = createEl('div', 'workbench-grid');
        var formCol = createEl('div', 'form-grid');
        var resCol = createEl('div');

        function updateImpRes() {
          clearEl(resCol);
          var impRes = calculateImportCogs(state.importInputs);
          var kpiG = createEl('div', 'kpi-grid');
          kpiG.appendChild(
            makeResultBox(
              t('개당 도착원가 (VAT 포함 현금기준)', 'Landed COGS / Unit (Cash Incl. VAT)'),
              formatCurrency(impRes.unitLandedCogsCash),
              t('판매 가능 ' + impRes.sellableQuantity + '개 기준', 'Across ' + impRes.sellableQuantity + ' sellable units'),
              'highlight'
            )
          );
          kpiG.appendChild(
            makeResultBox(
              t('개당 실원가 (부가세 환급 차감)', 'Landed COGS / Unit (Excl. Creditable VAT)'),
              formatCurrency(impRes.unitLandedCogsSupply),
              t('일반과세 매입세액 ' + formatCurrency(impRes.totalRefundableVatKrw) + ' 공제 후', 'After ' + formatCurrency(impRes.totalRefundableVatKrw) + ' VAT refund'),
              'positive'
            )
          );
          kpiG.appendChild(
            makeResultBox(
              t('총 수입 현금 소요액 (물대+관부가세+물류)', 'Total Landed Cash Outflow'),
              formatCurrency(impRes.totalCashOutflowKrw),
              t('과세가격(CIF) ' + formatCurrency(impRes.cifTaxableValueKrw), 'CIF Value ' + formatCurrency(impRes.cifTaxableValueKrw)),
              ''
            )
          );
          kpiG.appendChild(
            makeResultBox(
              t('예상 관세 + 수입부가세 합계', 'Customs Duty + Import VAT'),
              formatCurrency(impRes.customsDutyKrw + impRes.importVatKrw),
              t('관세 ' + formatCurrency(impRes.customsDutyKrw) + ' / 세관VAT ' + formatCurrency(impRes.importVatKrw), 'Duty ' + formatCurrency(impRes.customsDutyKrw) + ' / VAT ' + formatCurrency(impRes.importVatKrw)),
              ''
            )
          );
          resCol.appendChild(kpiG);

          var btnRow = createEl('div', 'btn-row');
          var applyCashBtn = createEl('button', 'btn btn-primary btn-table-sm', t('개당 도착원가(VAT포함 ' + formatCurrency(impRes.unitLandedCogsCash) + ')를 상단 원가(COGS)에 반영', 'Apply Cash Landed COGS (' + formatCurrency(impRes.unitLandedCogsCash) + ')'));
          applyCashBtn.type = 'button';
          applyCashBtn.addEventListener('click', function () {
            if (typeof opts.onApplyCogs === 'function') {
              opts.onApplyCogs(impRes.unitLandedCogsCash, impRes);
            }
          });
          btnRow.appendChild(applyCashBtn);
          resCol.appendChild(btnRow);
        }

        var row1 = createEl('div', 'form-grid-2');
        row1.appendChild(
          makeField(
            t('결제 통화', 'Currency'),
            'select',
            state.importInputs.currency,
            null,
            function (v) {
              state.importInputs.currency = v === 'USD' ? 'USD' : 'CNY';
              updateImpRes();
            },
            [
              { value: 'CNY', label: t('중국 위안 (CNY ¥)', 'CNY (¥)') },
              { value: 'USD', label: t('미국 달러 (USD $)', 'USD ($)') }
            ]
          )
        );
        row1.appendChild(
          makeField(t('적용 환율 (원)', 'Exchange Rate (KRW)'), 'number', state.importInputs.exchangeRate, '1', function (v) {
            state.importInputs.exchangeRate = Number(v);
            updateImpRes();
          })
        );
        formCol.appendChild(row1);

        var row2 = createEl('div', 'form-grid-2');
        row2.appendChild(
          makeField(t('해외 개당 사입 단가 (외화)', 'Foreign Unit Price'), 'number', state.importInputs.foreignUnitPrice, '0.1', function (v) {
            state.importInputs.foreignUnitPrice = Number(v);
            updateImpRes();
          })
        );
        row2.appendChild(
          makeField(t('총 사입 수량 (개)', 'Order Quantity'), 'number', state.importInputs.orderQuantity, '1', function (v) {
            state.importInputs.orderQuantity = Number(v);
            updateImpRes();
          })
        );
        formCol.appendChild(row2);

        var row3 = createEl('div', 'form-grid-2');
        row3.appendChild(
          makeField(t('중국 내륙운임 합계 (외화)', 'Local Shipping (Foreign)'), 'number', state.importInputs.localShippingForeign, '1', function (v) {
            state.importInputs.localShippingForeign = Number(v);
            updateImpRes();
          })
        );
        row3.appendChild(
          makeField(t('배대지 국제운임 합계 (원)', 'Intl Freight (KRW)'), 'number', state.importInputs.intlShippingKrw, '1000', function (v) {
            state.importInputs.intlShippingKrw = Number(v);
            updateImpRes();
          })
        );
        formCol.appendChild(row3);

        var row4 = createEl('div', 'form-grid-2');
        row4.appendChild(
          makeField(t('예상 관세율 (%)', 'Customs Duty (%)'), 'number', state.importInputs.customsDutyRate, '0.5', function (v) {
            state.importInputs.customsDutyRate = Number(v);
            updateImpRes();
          })
        );
        row4.appendChild(
          makeField(t('통관·원산지·국내택배 (원)', 'Clearance & Local Logistics'), 'number', state.importInputs.brokerAndClearanceFeeKrw, '1000', function (v) {
            state.importInputs.brokerAndClearanceFeeKrw = Number(v);
            updateImpRes();
          })
        );
        formCol.appendChild(row4);

        formCol.appendChild(
          makeField(t('예상 불량·파손율 (%)', 'Expected Defect Rate (%)'), 'number', state.importInputs.defectRatePct, '0.5', function (v) {
            state.importInputs.defectRatePct = Number(v);
            updateImpRes();
          })
        );

        grid.appendChild(formCol);
        grid.appendChild(resCol);
        paneContainer.appendChild(grid);
        updateImpRes();
        return;
      }

      if (state.activeTab === 'risk') {
        var rGrid = createEl('div', 'workbench-grid');
        var rForm = createEl('div', 'form-grid');
        var rResCol = createEl('div');

        function updateRiskRes() {
          clearEl(rResCol);
          var riskRes = calculateReturnAndInventoryRisk(getBase(), state.riskInputs);
          var kpiG = createEl('div', 'kpi-grid');
          kpiG.appendChild(
            makeResultBox(
              t('반품 손실 반영 기대 순이익 (1건당)', 'Expected Net Profit (After Returns)'),
              formatCurrency(riskRes.expectedProfitPerOrder),
              t(
                '명목 이익 ' + formatCurrency(riskRes.nominalUnitProfit) + ' → 실질 마진 ' + (riskRes.expectedMarginRate !== null ? formatPercent(riskRes.expectedMarginRate) : '-'),
                'Nominal ' + formatCurrency(riskRes.nominalUnitProfit)
              ),
              riskRes.expectedProfitPerOrder >= 0 ? 'positive' : 'negative'
            )
          );
          kpiG.appendChild(
            makeResultBox(
              t('반품 1건 발생 시 메워야 할 판매수', 'Normal Orders to Offset 1 Return'),
              riskRes.ordersNeededToCoverOneReturn !== null ? formatNumber(riskRes.ordersNeededToCoverOneReturn, 1) + t('건', ' orders') : t('회복 불가', 'N/A'),
              t('반품 1건 매몰 손실: ' + formatCurrency(riskRes.lossPerReturnOrder), 'Loss per return: ' + formatCurrency(riskRes.lossPerReturnOrder)),
              'negative'
            )
          );
          kpiG.appendChild(
            makeResultBox(
              t('사입 원금(' + formatCurrency(riskRes.totalBatchCogs) + ') 회수 수량', 'Batch Inventory Break-Even Qty'),
              riskRes.breakEvenSellQty !== null ? formatNumber(riskRes.breakEvenSellQty) + t('개 판매', ' units') : t('회수 불가 (역마진)', 'Unrecoverable'),
              riskRes.breakEvenSellThroughPct !== null
                ? t('총 ' + riskRes.inputs.inventoryBatchQty + '개 중 ' + formatPercent(riskRes.breakEvenSellThroughPct) + ' 소진 시 본전', formatPercent(riskRes.breakEvenSellThroughPct) + ' sell-through')
                : t('단위 공헌이익 부족', 'Insufficient unit margin'),
              riskRes.isBatchRecoverable ? 'highlight' : 'negative'
            )
          );
          kpiG.appendChild(
            makeResultBox(
              t('반품 반영 월 예상 순이익', 'Expected Monthly Profit'),
              formatCurrency(riskRes.expectedMonthlyProfit),
              t('월 ' + formatNumber(riskRes.profitResult.monthlyUnits) + '건 판매 가정', riskRes.profitResult.monthlyUnits + ' orders/mo'),
              riskRes.expectedMonthlyProfit >= 0 ? 'positive' : 'negative'
            )
          );
          rResCol.appendChild(kpiG);

          var gaugeWrap = createEl('div', 'threshold-meter-wrap');
          var gHead = createEl('div', 'threshold-header-row');
          gHead.appendChild(createEl('span', '', t('사입 재고 원금 회수 손익분기점 (목표 소진율)', 'Inventory Cost Recovery Progress')));
          gHead.appendChild(
            createEl(
              'span',
              'tax-num',
              riskRes.breakEvenSellThroughPct !== null ? formatPercent(riskRes.breakEvenSellThroughPct) : t('산출 불가', 'N/A')
            )
          );
          gaugeWrap.appendChild(gHead);
          var gBar = createEl('div', 'inventory-gauge-bar');
          var gFill = createEl('div', 'inventory-gauge-fill' + (!riskRes.isBatchRecoverable ? ' is-danger' : ''));
          gFill.style.width = Math.min(100, Math.max(0, riskRes.breakEvenSellThroughPct || 100)) + '%';
          gBar.appendChild(gFill);
          gaugeWrap.appendChild(gBar);
          rResCol.appendChild(gaugeWrap);
        }

        rForm.appendChild(
          makeField(t('예상 반품·교환율 (%)', 'Expected Return Rate (%)'), 'number', state.riskInputs.returnRatePct, '0.5', function (v) {
            state.riskInputs.returnRatePct = Number(v);
            updateRiskRes();
          })
        );
        rForm.appendChild(
          makeField(t('반품 1건당 왕복 택배 손실 (원)', 'Round-Trip Return Shipping Loss'), 'number', state.riskInputs.roundTripReturnShippingKrw, '100', function (v) {
            state.riskInputs.roundTripReturnShippingKrw = Number(v);
            updateRiskRes();
          })
        );
        rForm.appendChild(
          makeField(t('포장재·재검수 폐기 손실 (원)', 'Repackaging / Damage Loss'), 'number', state.riskInputs.returnRepackLossKrw, '100', function (v) {
            state.riskInputs.returnRepackLossKrw = Number(v);
            updateRiskRes();
          })
        );
        rForm.appendChild(
          makeField(t('총 사입 재고 수량 (개)', 'Batch Inventory Quantity'), 'number', state.riskInputs.inventoryBatchQty, '1', function (v) {
            state.riskInputs.inventoryBatchQty = Number(v);
            updateRiskRes();
          })
        );

        rGrid.appendChild(rForm);
        rGrid.appendChild(rResCol);
        paneContainer.appendChild(rGrid);
        updateRiskRes();
        return;
      }

      if (state.activeTab === 'financing') {
        var fGrid = createEl('div', 'workbench-grid');
        var fForm = createEl('div', 'form-grid');
        var fResCol = createEl('div');

        function updateFinRes() {
          clearEl(fResCol);
          var fin = calculateFinancingImpact(getBase(), state.finInputs);
          var kpiG = createEl('div', 'kpi-grid');
          kpiG.appendChild(
            makeResultBox(
              t('선정산 이용 시 건당 순이익', 'Unit Profit After Early Payout Fee'),
              formatCurrency(fin.unitProfitAfterEarlyPay),
              t('건당 수수료 -' + formatCurrency(fin.earlyPayFeePerOrder) + ' (마진 ' + formatPercent(fin.marginDropPctPoints) + 'p 잠식)', 'Fee -' + formatCurrency(fin.earlyPayFeePerOrder)),
              fin.unitProfitAfterEarlyPay >= 0 ? 'highlight' : 'negative'
            )
          );
          kpiG.appendChild(
            makeResultBox(
              t('선정산 연환산 실효금리 (APR)', 'Early Payout Effective APR'),
              formatPercent(fin.earlyPayEffectiveAprPct),
              t('일 ' + fin.inputs.earlyPayDailyFeeRatePct + '% × 365일 환산', fin.inputs.earlyPayDailyFeeRatePct + '%/day × 365'),
              'negative'
            )
          );
          kpiG.appendChild(
            makeResultBox(
              t('월간 선정산 수수료 총액', 'Monthly Early Payout Cost'),
              formatCurrency(fin.monthlyEarlyPayCost),
              t('이용 후 월 순이익: ' + formatCurrency(fin.monthlyProfitAfterEarlyPay), 'Monthly Profit: ' + formatCurrency(fin.monthlyProfitAfterEarlyPay)),
              ''
            )
          );
          kpiG.appendChild(
            makeResultBox(
              t('사업자 대출 월 예상 이자', 'Monthly Business Loan Interest'),
              formatCurrency(fin.monthlyLoanInterest),
              t('이자 차감 후 월 순이익: ' + formatCurrency(fin.monthlyProfitAfterLoan), 'After-Loan Profit: ' + formatCurrency(fin.monthlyProfitAfterLoan)),
              'positive'
            )
          );
          fResCol.appendChild(kpiG);
          fResCol.appendChild(createEl('div', 'tax-comp-note', fin.comparisonNote));
        }

        fForm.appendChild(
          makeField(t('선정산 단축 일수 (일, 쿠팡 평균 30~45일)', 'Early Payout Advance Days'), 'number', state.finInputs.earlyPayAdvanceDays, '1', function (v) {
            state.finInputs.earlyPayAdvanceDays = Number(v);
            updateFinRes();
          })
        );
        fForm.appendChild(
          makeField(t('선정산 일 수수료율 (%)', 'Daily Fee Rate (%)'), 'number', state.finInputs.earlyPayDailyFeeRatePct, '0.005', function (v) {
            state.finInputs.earlyPayDailyFeeRatePct = Number(v);
            updateFinRes();
          })
        );
        fForm.appendChild(
          makeField(t('비교용 사업자 운전자금 대출금 (원)', 'Working Capital Loan Amount (KRW)'), 'number', state.finInputs.loanAmountKrw, '1000000', function (v) {
            state.finInputs.loanAmountKrw = Number(v);
            updateFinRes();
          })
        );
        fForm.appendChild(
          makeField(t('사업자 대출 연금리 (%)', 'Loan Annual Interest Rate (%)'), 'number', state.finInputs.loanAnnualRatePct, '0.1', function (v) {
            state.finInputs.loanAnnualRatePct = Number(v);
            updateFinRes();
          })
        );

        fGrid.appendChild(fForm);
        fGrid.appendChild(fResCol);
        paneContainer.appendChild(fGrid);
        updateFinRes();
      }
    }

    function renderAll() {
      clearEl(container);
      var header = createEl('div', 'bulk-excel-header');
      var titleBox = createEl('div');
      titleBox.appendChild(
        createEl(
          'h2',
          'card-title',
          t('셀러 실전 확장 워크벤치 (마켓 비교 · 사입 원가 · 반품/재고 · 선정산 분석)', 'Seller Operational Workbench (Markets · Import COGS · Returns · Financing)')
        )
      );
      titleBox.appendChild(
        createEl(
          'p',
          'card-subtitle',
          t(
            '상단 계산기 입력값과 실시간 연동되어 7개 마켓 손익, 1688 수입 관부가세 원가, 반품·재고 본전 수량, 선정산 마진 잠식을 즉시 시뮬레이션합니다.',
            'Synced in real time with your active inputs: compare 7 markets, calculate landed import COGS, return/inventory break-even, and financing fees.'
          )
        )
      );
      header.appendChild(titleBox);
      container.appendChild(header);

      var tabBar = createEl('div', 'workbench-tabs');
      var pane = createEl('div', 'workbench-pane');

      tabsSpec.forEach(function (tab) {
        var btn = createEl(
          'button',
          'workbench-tab-btn' + (tab.key === state.activeTab ? ' active' : ''),
          currentLang === 'en' ? tab.en : tab.ko
        );
        btn.type = 'button';
        btn.addEventListener('click', function () {
          state.activeTab = tab.key;
          renderAll();
        });
        tabBar.appendChild(btn);
      });

      container.appendChild(tabBar);
      container.appendChild(pane);
      renderActivePane(pane);
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('sellermath:langchange', renderAll);
    }

    renderAll();

    return {
      recalculate: function () {
        var paneEl = container.querySelector('.workbench-pane');
        if (paneEl) {
          renderActivePane(paneEl);
        }
      },
      setTab: function (tabKey) {
        state.activeTab = tabKey;
        renderAll();
      }
    };
  }

  return {
    DEFAULT_INPUTS: DEFAULT_INPUTS,
    FEE_BASIS_LABELS: FEE_BASIS_LABELS,
    AD_REVENUE_BASIS_LABELS: AD_REVENUE_BASIS_LABELS,
    TAXPAYER_LABELS: TAXPAYER_LABELS,
    VAT_SIMPLIFIED_THRESHOLD: VAT_SIMPLIFIED_THRESHOLD,
    VAT_EXEMPT_PAYMENT_THRESHOLD: VAT_EXEMPT_PAYMENT_THRESHOLD,
    KOREAN_INCOME_TAX_BRACKETS: KOREAN_INCOME_TAX_BRACKETS,
    INDUSTRY_TAX_SPECS: INDUSTRY_TAX_SPECS,
    MARKETPLACE_PRESETS: MARKETPLACE_PRESETS,
    calculateKoreanTax: calculateKoreanTax,
    compareMarketplaces: compareMarketplaces,
    mountMarketPresetPills: mountMarketPresetPills,
    calculateImportCogs: calculateImportCogs,
    calculateReturnAndInventoryRisk: calculateReturnAndInventoryRisk,
    calculateFinancingImpact: calculateFinancingImpact,
    buildShareUrl: buildShareUrl,
    parseShareUrlParams: parseShareUrlParams,
    downloadReportCardPng: downloadReportCardPng,
    mountSellerWorkbench: mountSellerWorkbench,
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
    renderScenarioTable: renderScenarioTable,
    parseDelimitedText: parseDelimitedText,
    detectColumnMapping: detectColumnMapping,
    computeBatchRows: computeBatchRows,
    parseSpreadsheetFile: parseSpreadsheetFile,
    downloadSampleExcelTemplate: downloadSampleExcelTemplate,
    mountBulkExcelWidget: mountBulkExcelWidget
  };
});
