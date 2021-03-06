import { Component, Input } from '@angular/core'
import { IAirGapTransaction, AirGapMarketWallet } from 'airgap-coin-lib'
import { Platform } from '@ionic/angular'
import { DataService, DataServiceKey } from 'src/app/services/data/data.service'
import { Router } from '@angular/router'
import { handleErrorSentry, ErrorCategory } from 'src/app/services/sentry-error-handler/sentry-error-handler'
declare let cordova

@Component({
  selector: 'transaction-list',
  templateUrl: './transaction-list.component.html',
  styleUrls: ['./transaction-list.component.scss']
})
export class TransactionListComponent {
  constructor(private readonly platform: Platform, public readonly dataService: DataService, public readonly router: Router) {}

  @Input()
  public transactions: IAirGapTransaction[] = []

  @Input()
  public isRefreshing: boolean = false

  @Input()
  public transactionType: any

  @Input()
  public hasPendingTransactions: boolean = false

  @Input()
  public hasExchangeTransactions: boolean = false

  @Input()
  public initialTransactionsLoaded: boolean = false

  @Input()
  public wallet: AirGapMarketWallet

  public async openBlockexplorer(): Promise<void> {
    const blockexplorer = await this.wallet.coinProtocol.getBlockExplorerLinkForAddress(this.wallet.addresses[0])

    this.openUrl(blockexplorer)
  }

  private openUrl(url: string): void {
    if (this.platform.is('ios') || this.platform.is('android')) {
      cordova.InAppBrowser.open(url, '_system', 'location=true')
    } else {
      window.open(url, '_blank')
    }
  }
  public openTransactionDetailPage(transaction: IAirGapTransaction): void {
    this.dataService.setData(DataServiceKey.DETAIL, transaction)
    this.router.navigateByUrl('/transaction-detail/' + DataServiceKey.DETAIL).catch(handleErrorSentry(ErrorCategory.NAVIGATION))
  }
}
