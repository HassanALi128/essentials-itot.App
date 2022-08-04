import { Component, ElementRef, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { Subject } from 'rxjs';
import { WidgetsService } from 'src/app/launcher/widgets/services/widgets.service';
import { GlobalThemeService } from '../../../../services/global.theme.service';
import { WidgetPluginsService } from '../../services/plugin.service';
import { Widget } from '../widget.interface';
import { WidgetState } from '../widgetcontainerstate';

@Component({
  selector: 'widget-holder',
  templateUrl: './widget-holder.component.html',
  styleUrls: ['./widget-holder.component.scss'],
})
export class WidgetHolderComponent implements OnInit {
  public root: ElementRef;

  @ViewChild('container', { static: true, read: ViewContainerRef })
  public container: ViewContainerRef;

  @ViewChild('dragHandle', { static: true, read: ElementRef })
  public dragHandle: ElementRef;

  private widgetState: WidgetState = null;
  private widgetComponent: Widget = null;

  public editing = false;
  public selecting = false;

  public onWidgetSelected = new Subject<WidgetState>();

  constructor(
    public theme: GlobalThemeService,
    private widgetsService: WidgetsService,
    private widgetsPluginsService: WidgetPluginsService,
    elRef: ElementRef, // To get the root component instance
  ) {
    this.root = elRef;
  }

  ngOnInit() {
    this.widgetsService.editionMode.subscribe(editionMode => this.editing = editionMode);
  }

  public attachWidgetInfo(widgetState: WidgetState) {
    this.widgetState = widgetState;
  }

  /**
   * Attaches the widget component instance displayed inside this holder.
   */
  public attachWidgetComponent(widgetComponent: Widget) {
    this.widgetComponent = widgetComponent;
  }

  async deleteWidget() {
    await this.widgetsService.deleteWidget(this.widgetState.id);
  }

  public disablerTouchStart(ev: TouchEvent) {
    // Interrupt all touch events to items behind the disabler
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }

  /**
   * User has selected a widget, let listeners (widget container) know.
   */
  public selectWidget() {
    this.onWidgetSelected.next(this.widgetState);
  }

  /**
   * Reloads the plugin JSON data from its remote url and refreshes this widget
   */
  public async refreshPluginContent() {
    await this.widgetsPluginsService.refreshPluginContent(this.widgetState);
  }

  /**
   * Deletes the custom plugin from the addable list in the plugins service.
   * This deletion will trigger an event catched by the widget container to refresh
   * the current list.
   */
  public deleteCustomPluginFromAddableList() {
    void this.widgetsPluginsService.removeDAppPluginFromAvailableWidgets(this.widgetState);
  }
}
